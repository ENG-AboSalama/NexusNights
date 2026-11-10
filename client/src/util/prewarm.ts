import { api } from '../api';
import type { EpisodeDetail } from '../api-types';

interface PrewarmState {
  mediaId: string | null;
  abortController: AbortController | null;
  metadata: EpisodeDetail | null;
  imageLoaded: boolean;
}

const state: PrewarmState = {
  mediaId: null,
  abortController: null,
  metadata: null,
  imageLoaded: false,
};

/**
 * Pre-warm the next episode by fetching its metadata and preloading its poster/still.
 * Should be called when approaching the end of the current episode.
 */
export function prewarmNextEpisode(nextMediaId: string | null, lang: string): void {
  // Cancel any ongoing prewarm if we're changing targets
  if (state.mediaId !== nextMediaId) {
    cancelPrewarm();
  }

  if (!nextMediaId) return;

  // Already prewarming this episode
  if (state.mediaId === nextMediaId && state.abortController) return;

  state.mediaId = nextMediaId;
  state.abortController = new AbortController();

  // Fetch metadata
  api
    .media(nextMediaId, lang, state.abortController.signal)
    .then((metadata) => {
      if (state.mediaId !== nextMediaId) return; // Cancelled or changed
      state.metadata = metadata;

      // Preload the still image (episode thumbnail)
      if (metadata.stillUrl) {
        const img = new Image();
        img.src = metadata.stillUrl.startsWith('/') ? metadata.stillUrl : metadata.stillUrl;
        img.onload = () => {
          if (state.mediaId === nextMediaId) {
            state.imageLoaded = true;
          }
        };
        img.onerror = () => {
          // Silently fail on image preload errors
        };
      }

      // Optionally preload video manifest (HLS) - only if playback mode is HLS
      // This is lightweight - just the manifest, not the segments
      if (metadata.playback?.mode === 'hls') {
        void prewarmHlsManifest(nextMediaId);
      }
    })
    .catch((error) => {
      // Silently handle errors (network failure, 404, etc)
      if (error.name !== 'AbortError') {
        console.debug('[prewarm] Failed to fetch next episode metadata:', error);
      }
    });
}

/**
 * Preload the HLS manifest (master.m3u8) without loading segments.
 * This warms up the HLS preparation on the server side.
 */
async function prewarmHlsManifest(mediaId: string): Promise<void> {
  if (!state.abortController) return;

  try {
    // Fetch HLS status to potentially trigger server-side preparation
    await api.hlsStatus(mediaId, state.abortController.signal);

    // Optionally fetch the manifest itself to cache it
    // Note: We're not loading segments, just the manifest
    const manifestUrl = `/api/hls/${mediaId}/master.m3u8`;
    await fetch(manifestUrl, {
      signal: state.abortController.signal,
      // Use 'no-store' to ensure we're triggering server preparation
      // but not storing the result (it may not be ready yet)
      cache: 'no-store',
    });
  } catch (error) {
    // Silently handle - prewarm is best-effort
    if (error && typeof error === 'object' && 'name' in error && error.name !== 'AbortError') {
      console.debug('[prewarm] HLS manifest prewarm failed:', error);
    }
  }
}

/**
 * Cancel ongoing prewarm operations.
 * Call this when:
 * - User navigates away from the watch page
 * - User manually selects a different episode
 * - Playback stops
 */
export function cancelPrewarm(): void {
  if (state.abortController) {
    state.abortController.abort();
  }
  state.mediaId = null;
  state.abortController = null;
  state.metadata = null;
  state.imageLoaded = false;
}

/**
 * Get the prewarmed metadata if available
 */
export function getPrewarmedMetadata(mediaId: string): EpisodeDetail | null {
  return state.mediaId === mediaId ? state.metadata : null;
}

/**
 * Calculate when to start prewarming based on video duration and current time.
 * Returns true if we should start prewarming now.
 * 
 * Strategy:
 * - For short videos (<10 min): start 90 seconds before end
 * - For medium videos (10-30 min): start 2 minutes before end
 * - For long videos (>30 min): start 3 minutes before end
 */
export function shouldStartPrewarm(currentTime: number, duration: number): boolean {
  if (!duration || duration <= 0) return false;

  const remaining = duration - currentTime;

  if (duration < 600) {
    // <10 minutes: prewarm at 90 seconds remaining
    return remaining <= 90 && remaining > 0;
  } else if (duration < 1800) {
    // 10-30 minutes: prewarm at 2 minutes remaining
    return remaining <= 120 && remaining > 0;
  } else {
    // >30 minutes: prewarm at 3 minutes remaining
    return remaining <= 180 && remaining > 0;
  }
}
