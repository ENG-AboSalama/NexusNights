import type { ProviderAdapter, ProviderMediaRequest, ProviderResult } from '../types';

/**
 * VidRock Adapter
 * Evaluation: vidrock.to does not offer a documented public developer API or authorized embed integration.
 * In accordance with project policy, this provider is explicitly marked as unsupported rather than
 * implementing unauthorized scraping, reverse-engineered stream extraction, or anti-bot circumvention.
 */
export class VidRockAdapter implements ProviderAdapter {
  readonly id = 'vidrock';
  readonly name = 'VidRock';
  readonly isSupported = false;
  readonly supportedTypes = ['movie', 'series'] as const;
  readonly basePriority = 0;

  async resolve(_req: ProviderMediaRequest): Promise<ProviderResult> {
    return {
      providerId: this.id,
      providerName: this.name,
      isSupported: false,
      sources: [],
      diagnostics: [
        'VidRock is unsupported: no documented public developer API or authorized embed integration is available.',
      ],
    };
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}
