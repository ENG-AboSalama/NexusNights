/**
 * URL utilities for embed players
 * Simplified version after removing Discord Activity SDK
 */

/**
 * Map provider embed URL (no-op now that we're not in Discord Activity)
 * Previously handled Discord proxy URLs
 */
export function mapProviderEmbedUrl(url: string): string {
  return url;
}

/**
 * Remap VidAPI nested player frame (no-op now that we're not in Discord Activity)
 * Previously handled VidAPI frame remapping for Discord
 */
export function remapVidApiNestedPlayerFrame(
  iframe: HTMLIFrameElement | null,
  originalUrl: string
): { status: 'not-applicable' | 'success' | 'failed'; originalUrl?: string; mappedUrl?: string } {
  return {
    status: 'not-applicable',
    originalUrl,
  };
}
