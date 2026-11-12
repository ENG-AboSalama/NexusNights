import type { ProviderAdapter, ProviderMediaRequest, ProviderResult } from '../types';

export class VixSrcAdapter implements ProviderAdapter {
  readonly id = 'vixsrc';
  readonly name = 'VixSrc';
  readonly isSupported = true;
  readonly supportedTypes = ['movie', 'series'] as const;
  readonly basePriority = 90;

  private readonly BASE_URL = 'https://vixsrc.to';

  async resolve(req: ProviderMediaRequest): Promise<ProviderResult> {
    if (!req.tmdbId || req.tmdbId <= 0) {
      return {
        providerId: this.id,
        providerName: this.name,
        isSupported: this.isSupported,
        sources: [],
        diagnostics: ['Invalid TMDB ID'],
      };
    }

    let url: string;
    if (req.kind === 'movie') {
      url = `${this.BASE_URL}/movie/${req.tmdbId}`;
    } else {
      const season = req.season ?? 1;
      const episode = req.episode ?? 1;
      url = `${this.BASE_URL}/tv/${req.tmdbId}/${season}/${episode}`;
    }

    return {
      providerId: this.id,
      providerName: this.name,
      isSupported: this.isSupported,
      sources: [
        {
          id: `${this.id}-${req.kind}-${req.tmdbId}${req.season ? `-s${req.season}e${req.episode}` : ''}`,
          url,
          type: 'embed',
          embedUrl: url, // Add embed URL for server-side streaming
          quality: '1080p',
          providerId: this.id,
          providerName: this.name,
          isEmbed: true,
          priority: this.basePriority,
        },
      ],
      diagnostics: [],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.BASE_URL}/`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'NexusNight/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok || res.status === 403 || res.status === 301 || res.status === 302;
    } catch {
      return false;
    }
  }
}
