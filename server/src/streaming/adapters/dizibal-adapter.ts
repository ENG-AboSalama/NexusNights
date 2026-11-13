/**
 * Dizibal Provider Adapter
 * Turkish streaming site with direct M3U8 sources
 * Supports: Turkish movies, series, and anime
 */

import type { ProviderAdapter, ProviderMediaRequest, ProviderResult, ProviderSource } from '../types';
import { DOMAIN_CANDIDATES, DIZIBAL_VERSION } from './dizibal/constants';
import {
  normalizeMediaType,
  normalizeTitle,
  extractYear,
  posterKey,
  fetchText,
  parsePlayerEmbed,
  parsePlayerConfig,
  detectHlsQuality,
  qualityFromRelease,
  normalizeSubtitles,
  audioSummary,
  streamHeaders,
  ensureHlsExtHint,
} from './dizibal/helpers';
import { getTmdbInfo } from './dizibal/tmdb';

interface SearchItem {
  type: string;
  title: string;
  url: string;
  poster: string;
  meta: string;
}

interface SuggestResponse {
  movies?: SearchItem[];
  series?: SearchItem[];
}

export class DizibalAdapter implements ProviderAdapter {
  readonly id = 'dizibal';
  readonly name = 'Dizibal';
  readonly isSupported = true;
  readonly supportedTypes = ['movie', 'series'] as const;
  readonly basePriority = 200; // High priority for Turkish content

  /**
   * Fetch suggestions from Dizibal search API
   */
  private async suggest(domain: string, query: string): Promise<SuggestResponse> {
    const text = await fetchText(
      `${domain}/ara/oneri?q=${encodeURIComponent(query)}`,
      `${domain}/`,
      'application/json'
    );
    return JSON.parse(text);
  }

  /**
   * Score search result item for relevance
   * Returns null if item definitely doesn't match
   */
  private scoreItem(
    item: SearchItem,
    targets: string[],
    year: string,
    posterPath: string | null
  ): number | null {
    // Poster match is definitive proof (same TMDB ID)
    const posterMatch = !!posterPath && posterKey(item.poster) === posterKey(posterPath);
    if (posterMatch) return 100;

    // Title must match
    const title = normalizeTitle(item.title);
    if (!title || !targets.includes(title)) return null;

    // Year should match if available (avoid different productions with same name)
    const itemYear = extractYear(item.meta);
    if (year && itemYear) {
      const diff = Math.abs(Number(itemYear) - Number(year));
      if (diff > 1) return null; // Different production
      return diff === 0 ? 20 : 15;
    }

    return 10;
  }

  /**
   * Search for content on Dizibal
   */
  private async searchContent(
    type: 'movie' | 'tv',
    titles: string[],
    year: string,
    posterPath: string | null
  ): Promise<{ domain: string | null; items: SearchItem[] }> {
    const group = type === 'tv' ? 'series' : 'movies';
    const targets = titles.map(normalizeTitle).filter(Boolean);

    for (const domain of DOMAIN_CANDIDATES) {
      const byUrl = new Map<string, { item: SearchItem; score: number }>();
      let reachable = false;

      for (const query of titles) {
        let data: SuggestResponse;
        try {
          data = await this.suggest(domain, query);
          reachable = true;
        } catch {
          continue;
        }

        const items = (data && data[group]) || [];
        for (const item of items) {
          if (!item || !item.url || byUrl.has(item.url)) continue;

          const score = this.scoreItem(item, targets, year, posterPath);
          if (score !== null) {
            byUrl.set(item.url, { item, score });
          }
        }

        // Stop if we found a definitive match (poster)
        if ([...byUrl.values()].some((c) => c.score >= 100)) break;
      }

      if (!reachable) continue;

      // Sort by score and return items
      const items = [...byUrl.values()]
        .sort((a, b) => b.score - a.score)
        .map((c) => c.item);

      return { domain, items };
    }

    return { domain: null, items: [] };
  }

  /**
   * Build page URL for specific episode/movie
   */
  private pageUrlFor(
    item: SearchItem,
    type: 'movie' | 'tv',
    season?: number,
    episode?: number
  ): string {
    const base = String(item.url).replace(/\/+$/, '');
    return type === 'tv' ? `${base}/season/${season || 1}/episode/${episode || 1}` : base;
  }

  /**
   * Fetch player configuration
   */
  private async fetchPlayer(
    domain: string,
    pageUrl: string
  ): Promise<{ config: any; host: string } | null> {
    const html = await fetchText(pageUrl, `${domain}/`);
    const embed = parsePlayerEmbed(html);
    if (!embed) return null;

    const playerUrl = `${embed.host}/assets/js/s.php?s=${encodeURIComponent(embed.slug)}`;
    const playerHtml = await fetchText(playerUrl, `${domain}/`);
    const config = parsePlayerConfig(playerHtml);
    if (!config) return null;

    return { config, host: embed.host };
  }

  /**
   * Resolve streams for the given media
   */
  async resolve(req: ProviderMediaRequest): Promise<ProviderResult> {
    const diagnostics: string[] = [];

    try {
      console.log(
        `[Dizibal v${DIZIBAL_VERSION}] Resolving tmdb=${req.tmdbId} type=${req.kind} S${req.season}E${req.episode}`
      );

      const type = normalizeMediaType(req.kind);

      // Get TMDB info
      const { title, originalTitle, turkishTitle, year, posterPath } = await getTmdbInfo(
        req.tmdbId,
        type
      );

      const titles = [...new Set([turkishTitle, title, originalTitle].filter(Boolean))];
      diagnostics.push(`TMDB: ${titles.length} title variants (Turkish: ${turkishTitle || 'N/A'})`);

      if (!titles.length) {
        diagnostics.push('No titles available from TMDB');
        return {
          providerId: this.id,
          providerName: this.name,
          isSupported: this.isSupported,
          sources: [],
          diagnostics,
        };
      }

      // Search on Dizibal
      const { domain, items } = await this.searchContent(type, titles, year, posterPath);

      if (!domain) {
        const msg = 'No reachable Dizibal domain found';
        diagnostics.push(msg);
        console.log(`[Dizibal] ${msg}`);
        return {
          providerId: this.id,
          providerName: this.name,
          isSupported: this.isSupported,
          sources: [],
          diagnostics,
        };
      }

      const foundMsg = `Found ${items.length} candidates on ${domain}`;
      diagnostics.push(foundMsg);
      console.log(`[Dizibal] ${foundMsg}`);

      // Try top 3 results
      for (const item of items.slice(0, 3)) {
        const pageUrl = this.pageUrlFor(item, type, req.season, req.episode);

        try {
          const player = await this.fetchPlayer(domain, pageUrl);
          if (!player) {
            diagnostics.push(`No player found: ${pageUrl}`);
            continue;
          }

          const { config, host } = player;
          const headers = streamHeaders(host);

          // Verify stream is accessible
          let masterText = '';
          try {
            masterText = await fetchText(config.stream, `${host}/`, '*/*');
          } catch (e: any) {
            diagnostics.push(`Stream not accessible: ${e.message}`);
            continue;
          }

          if (!/#EXTM3U/.test(masterText)) {
            diagnostics.push('Stream is not valid HLS');
            continue;
          }

          // Extract quality
          const quality =
            detectHlsQuality(masterText) || qualityFromRelease(config.title) || 'Auto';

          // Normalize subtitles
          const subtitles = normalizeSubtitles(config.subs, host);

          // Build media title
          const name = item.title || title;
          const mediaTitle =
            type === 'tv'
              ? `${name} S${req.season || 1}E${req.episode || 1}`
              : `${name}${year ? ` (${year})` : ''}`;

          // Audio info
          const audio = audioSummary(config.audios);

          const source: ProviderSource = {
            id: `${this.id}-${req.kind}-${req.tmdbId}${req.season ? `-s${req.season}e${req.episode}` : ''}`,
            url: ensureHlsExtHint(config.stream),
            type: 'hls',
            quality,
            providerId: this.id,
            providerName: this.name,
            isEmbed: false,
            priority: this.basePriority,
            headers, // Include required headers for CORS bypass
            subtitles, // Include provider subtitles
          };

          const successMsg = `✓ Stream found: ${quality} HLS (${subtitles.length} subs)`;
          diagnostics.push(successMsg);
          console.log(`[Dizibal] ${successMsg}`);
          if (audio) {
            diagnostics.push(`Audio: ${audio}`);
            console.log(`[Dizibal] Audio: ${audio}`);
          }

          return {
            providerId: this.id,
            providerName: this.name,
            isSupported: this.isSupported,
            sources: [source],
            diagnostics,
          };
        } catch (e: any) {
          diagnostics.push(`Error on ${pageUrl}: ${e.message}`);
        }
      }

      diagnostics.push('No valid streams found in top results');
      console.log('[Dizibal] No valid streams found in top results');
      return {
        providerId: this.id,
        providerName: this.name,
        isSupported: this.isSupported,
        sources: [],
        diagnostics,
      };
    } catch (error: any) {
      const errMsg = `Fatal error: ${error.message}`;
      diagnostics.push(errMsg);
      console.error(`[Dizibal] ${errMsg}`, error);
      return {
        providerId: this.id,
        providerName: this.name,
        isSupported: this.isSupported,
        sources: [],
        diagnostics,
      };
    }
  }

  /**
   * Health check: verify at least one domain is reachable
   */
  async healthCheck(): Promise<boolean> {
    for (const domain of DOMAIN_CANDIDATES) {
      try {
        const res = await fetch(domain, {
          method: 'HEAD',
          headers: { 'User-Agent': 'NexusNight/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok || res.status === 403 || res.status === 301 || res.status === 302) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }
}
