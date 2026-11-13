/**
 * Playback Orchestrator
 * Custom multi-provider playback engine with source validation, health ranking, and automatic failover.
 */

import { providerRegistry, ProviderRegistry } from './provider-registry';
import { providerHealth, ProviderHealthTracker } from './provider-health';
import type {
  ProviderMediaRequest,
  ProviderSource,
  PlaybackConfig,
  PlaybackSource,
  PlaybackDiagnostic,
} from './types';

export class PlaybackOrchestrator {
  constructor(
    private registry: ProviderRegistry = providerRegistry,
    private health: ProviderHealthTracker = providerHealth
  ) {}

  /**
   * Resolve playback configuration for a movie across all supported providers
   */
  async resolveMovie(
    tmdbId: number,
    imdbId?: string,
    _localTitleId?: string
  ): Promise<PlaybackConfig> {
    if ((!tmdbId || tmdbId <= 0) && !imdbId) {
      return this.emptyConfig('Invalid media identifier');
    }

    const req: ProviderMediaRequest = {
      tmdbId,
      imdbId,
      kind: 'movie',
    };

    return this.orchestrate(req);
  }

  /**
   * Resolve playback configuration for a TV episode across all supported providers
   */
  async resolveTV(
    tmdbId: number,
    season: number,
    episode: number,
    imdbId?: string,
    _localTitleId?: string
  ): Promise<PlaybackConfig> {
    if ((!tmdbId || tmdbId <= 0) && !imdbId) {
      return this.emptyConfig('Invalid media identifier');
    }

    const req: ProviderMediaRequest = {
      tmdbId,
      imdbId,
      kind: 'series',
      season,
      episode,
    };

    return this.orchestrate(req);
  }

  /**
   * Check if content is Turkish via TMDB
   */
  private async isTurkishContent(tmdbId: number, kind: 'movie' | 'series'): Promise<boolean> {
    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_API_KEY) {
      console.warn('[PlaybackOrchestrator] TMDB_API_KEY not set, cannot detect Turkish content');
      return false;
    }

    try {
      const endpoint = kind === 'movie' ? 'movie' : 'tv';
      const isBearer = TMDB_API_KEY.startsWith('eyJ');
      const headers: Record<string, string> = isBearer ? { Authorization: `Bearer ${TMDB_API_KEY}` } : {};
      const apiParam = isBearer ? '' : `?api_key=${TMDB_API_KEY}`;
      
      const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}${apiParam}`;
      const response = await fetch(url, { headers: Object.keys(headers).length > 0 ? headers : undefined });
      
      if (!response.ok) return false;
      
      const data = await response.json() as { original_language?: string };
      return data.original_language === 'tr';
    } catch {
      return false;
    }
  }

  /**
   * Query supported providers, validate and rank sources
   */
  private async orchestrate(req: ProviderMediaRequest): Promise<PlaybackConfig> {
    let activeProviders = this.registry.getActive().filter((p) =>
      p.supportedTypes.includes(req.kind)
    );

    const diagnostics: PlaybackDiagnostic[] = [];

    // Turkish content optimization: use Dizibal exclusively
    const isTurkish = await this.isTurkishContent(req.tmdbId, req.kind);
    if (isTurkish) {
      const dizibal = activeProviders.find((p) => p.id === 'dizibal');
      if (dizibal) {
        activeProviders = [dizibal];
        diagnostics.push({
          code: 'TURKISH_CONTENT_DETECTED',
          message: 'Turkish content detected - using Dizibal provider exclusively for optimal streaming',
          severity: 'info',
        });
      }
    }

    // Note disabled providers in diagnostics
    const disabled = this.registry.getSupported().filter((p) => !this.registry.isEnabled(p.id));
    for (const d of disabled) {
      diagnostics.push({
        code: 'PROVIDER_DISABLED',
        message: `[${d.name}] Provider is currently disabled by user`,
        severity: 'info',
      });
    }

    if (activeProviders.length === 0) {
      return {
        source: null,
        alternatives: [],
        subtitles: [],
        canAutoSwitch: false,
        diagnostics: [
          ...diagnostics,
          {
            code: 'NO_ACTIVE_PROVIDERS',
            message: 'All supported streaming providers are currently disabled or unavailable',
            severity: 'warning',
          },
        ],
      };
    }

    const allSources: ProviderSource[] = [];

    // Query all active provider adapters in parallel with timeout safety
    const adapterTimeout = parseInt(process.env.PROVIDER_RESOLVE_TIMEOUT || '12000', 10);
    const results = await Promise.allSettled(
      activeProviders.map((p) =>
        Promise.race([
          p.resolve(req),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Provider resolution timeout')), adapterTimeout)
          ),
        ])
      )
    );

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const provider = activeProviders[i];

      if (res.status === 'fulfilled') {
        const val = res.value;
        if (val.sources && val.sources.length > 0) {
          allSources.push(...val.sources);
        }
        if (val.diagnostics && val.diagnostics.length > 0) {
          val.diagnostics.forEach((d) =>
            diagnostics.push({
              code: 'PROVIDER_DIAGNOSTIC',
              message: `[${provider.name}] ${d}`,
              severity: 'info',
            })
          );
        }
      } else {
        diagnostics.push({
          code: 'PROVIDER_RESOLUTION_FAILED',
          message: `[${provider.name}] Failed to resolve: ${(res.reason as Error)?.message || 'unknown error'}`,
          severity: 'warning',
        });
      }
    }

    // Also include unsupported providers in diagnostics if any were queried
    const unsupported = this.registry.getAll().filter((p) => !p.isSupported);
    for (const u of unsupported) {
      diagnostics.push({
        code: 'PROVIDER_UNSUPPORTED',
        message: `[${u.name}] Unsupported provider: no authorized open playback API or embed`,
        severity: 'info',
      });
    }

    if (allSources.length === 0) {
      return {
        source: null,
        alternatives: [],
        subtitles: [],
        canAutoSwitch: false,
        diagnostics,
      };
    }

    // Rank sources using health tracking & provider diversity
    const ranked = this.rankSources(allSources);
    const best = ranked[0] || null;
    const alternatives = ranked.slice(1, 6);

    const normalizedBest = best ? this.normalizeSource(best) : null;
    const normalizedAlts = alternatives.map((s) => this.normalizeSource(s));

    return {
      source: normalizedBest,
      alternatives: normalizedAlts,
      subtitles: [],
      canAutoSwitch: alternatives.length > 0,
      diagnostics,
    };
  }

  /**
   * Rank sources by base priority, live provider health score, cooldown status, and provider diversity
   */
  private rankSources(sources: ProviderSource[]): ProviderSource[] {
    const scored = sources.map((source) => {
      const pId = source.providerId.toLowerCase();
      let score = source.priority;

      // Quality scoring
      if (source.quality.includes('1080')) score += 10;
      else if (source.quality.includes('720')) score += 5;

      // Health score multiplier
      const healthScore = this.health.getProviderScore(pId);
      const inCooldown = this.health.isProviderInCooldown(pId);
      const sourceFailed = this.health.isSourceFailed(source.url);

      if (inCooldown) score *= 0.1;
      if (sourceFailed) score *= 0.2;
      score *= 0.5 + healthScore * 0.5;

      return { source, score };
    });

    // Initial sort
    scored.sort((a, b) => b.score - a.score);

    // Apply provider diversity penalty so alternatives prioritize different providers for resilience
    const providerCounts = new Map<string, number>();
    const diverseScored = scored.map((item) => {
      const pId = item.source.providerId.toLowerCase();
      const count = providerCounts.get(pId) || 0;
      providerCounts.set(pId, count + 1);
      return {
        source: item.source,
        score: item.score - count * 25,
      };
    });

    diverseScored.sort((a, b) => b.score - a.score);

    console.log('[PlaybackOrchestrator] Source ranking:');
    diverseScored.slice(0, 5).forEach((item, idx) => {
      console.log(
        `  ${idx + 1}. ${item.source.providerName} (${item.source.type}) - Score: ${item.score.toFixed(1)}`
      );
    });

    return diverseScored.map((s) => s.source);
  }

  private normalizeSource(source: ProviderSource): PlaybackSource {
    return {
      url: source.url,
      type: source.type,
      embedUrl: source.embedUrl, // Preserve embed URL for server-side streaming
      quality: source.quality,
      provider: source.providerName,
      isEmbed: source.isEmbed,
      audioTracks: source.audioTracks,
      id: source.id, // Keep for proxy registration
      headers: source.headers, // Keep for proxy
      subtitles: source.subtitles, // Keep provider subtitles
    };
  }

  private emptyConfig(errorMessage: string): PlaybackConfig {
    return {
      source: null,
      alternatives: [],
      subtitles: [],
      canAutoSwitch: false,
      diagnostics: [
        {
          code: 'NO_SOURCES',
          message: errorMessage,
          severity: 'error',
        },
      ],
    };
  }
}

// Global orchestrator singleton instance
export const playbackOrchestrator = new PlaybackOrchestrator();
