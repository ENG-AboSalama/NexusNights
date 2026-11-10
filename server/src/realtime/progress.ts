import type { Config } from '../config';
import { readJson, writeJsonAtomic } from '../util/fsx';

export interface Progress {
  t: number;                  // Playback position in seconds
  d: number;                  // Total duration in seconds
  at: number;                 // Timestamp when progress was recorded
  provider?: string;          // Last provider used ('local', 'VixSrc', 'VidAPI', etc.)
  contentKey?: string;        // Canonical key (e.g. 'movie-1368337', 'tv-76479-s1e1')
  tmdbId?: number | null;
  kind?: 'movie' | 'tv' | null;
  season?: number | null;
  episode?: number | null;
  completed?: boolean;        // True if >= 90% or remaining < 20s
  localMediaId?: string | null;
}

export function parseContentIdentity(id: string): {
  contentKey: string;
  tmdbId: number | null;
  kind: 'movie' | 'tv' | null;
  season: number | null;
  episode: number | null;
  lookupId: string;
} {
  // streaming-movie-{tmdbId}
  if (id.startsWith('streaming-movie-')) {
    const tmdbId = parseInt(id.replace('streaming-movie-', ''), 10);
    return {
      contentKey: `movie-${tmdbId}`,
      tmdbId: isNaN(tmdbId) ? null : tmdbId,
      kind: 'movie',
      season: null,
      episode: null,
      lookupId: id,
    };
  }

  // streaming-tv-{tmdbId}-{season}-{episode}
  if (id.startsWith('streaming-tv-')) {
    const parts = id.replace('streaming-tv-', '').split('-');
    const tmdbId = parseInt(parts[0], 10);
    const season = parseInt(parts[1], 10);
    const episode = parseInt(parts[2], 10);
    return {
      contentKey: `tv-${tmdbId}-s${season}e${episode}`,
      tmdbId: isNaN(tmdbId) ? null : tmdbId,
      kind: 'tv',
      season: isNaN(season) ? null : season,
      episode: isNaN(episode) ? null : episode,
      lookupId: id,
    };
  }

  // movie-{tmdbId}
  if (id.startsWith('movie-')) {
    const tmdbId = parseInt(id.replace('movie-', ''), 10);
    return {
      contentKey: id,
      tmdbId: isNaN(tmdbId) ? null : tmdbId,
      kind: 'movie',
      season: null,
      episode: null,
      lookupId: `streaming-movie-${tmdbId}`,
    };
  }

  // tv-{tmdbId}-s{s}e{e}
  const tvM = /^tv-(\d+)-s(\d+)e(\d+)$/.exec(id);
  if (tvM) {
    const tmdbId = parseInt(tvM[1], 10);
    const season = parseInt(tvM[2], 10);
    const episode = parseInt(tvM[3], 10);
    return {
      contentKey: id,
      tmdbId,
      kind: 'tv',
      season,
      episode,
      lookupId: `streaming-tv-${tmdbId}-${season}-${episode}`,
    };
  }

  // Local 12-hex ID or raw key
  return {
    contentKey: id,
    tmdbId: null,
    kind: null,
    season: null,
    episode: null,
    lookupId: id,
  };
}

/**
 * Universal Continue Watching Progress Store (persisted to data/progress.json).
 * Scoped per-user (Discord user ID or guest), supporting both local media and external providers.
 */
export class ProgressStore {
  private users = new Map<string, Record<string, Progress>>();
  private timer?: NodeJS.Timeout;

  constructor(private cfg: Config) {}

  async load() {
    const raw = await readJson<Record<string, Record<string, Progress>>>(this.cfg.progressFile);
    if (raw) {
      for (const [u, v] of Object.entries(raw)) {
        this.users.set(u, v);
      }
    }
  }

  get(userId: string): Record<string, Progress> {
    return this.users.get(userId) ?? {};
  }

  getByMedia(userId: string, id: string): Progress | undefined {
    const all = this.users.get(userId);
    if (!all) return undefined;
    if (all[id]) return all[id];
    const identity = parseContentIdentity(id);
    return all[identity.contentKey] || all[identity.lookupId];
  }

  put(
    userId: string,
    mediaId: string,
    t: number,
    d: number,
    meta?: Partial<Progress>
  ) {
    const all = this.users.get(userId) ?? {};
    const identity = parseContentIdentity(mediaId);

    const timeSec = Math.floor(Math.max(0, t));
    const durSec = Math.floor(Math.max(0, d));
    const isCompleted = meta?.completed ?? (durSec > 0 && (timeSec / durSec >= 0.90 || durSec - timeSec < 20));

    const record: Progress = {
      t: timeSec,
      d: durSec,
      at: Date.now(),
      provider: meta?.provider || 'local',
      contentKey: identity.contentKey,
      tmdbId: meta?.tmdbId ?? identity.tmdbId,
      kind: meta?.kind ?? identity.kind,
      season: meta?.season ?? identity.season,
      episode: meta?.episode ?? identity.episode,
      completed: isCompleted,
      localMediaId: meta?.localMediaId ?? (identity.contentKey === mediaId && !mediaId.startsWith('streaming-') && !mediaId.startsWith('movie-') && !mediaId.startsWith('tv-') ? mediaId : undefined),
    };

    // Store under primary mediaId
    all[mediaId] = record;

    // Also alias under canonical contentKey and lookupId so switching providers or querying via synthetic IDs yields identical progress
    if (identity.contentKey && identity.contentKey !== mediaId) {
      all[identity.contentKey] = record;
    }
    if (identity.lookupId && identity.lookupId !== mediaId) {
      all[identity.lookupId] = record;
    }
    if (record.localMediaId && record.localMediaId !== mediaId) {
      all[record.localMediaId] = record;
    }

    // Retain up to 250 records per user
    const keep = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 250);
    this.users.set(userId, Object.fromEntries(keep));
    this.scheduleSave();
  }

  remove(userId: string, mediaId: string): boolean {
    const all = this.users.get(userId);
    if (!all) return false;
    const identity = parseContentIdentity(mediaId);
    let removed = false;

    if (all[mediaId]) {
      delete all[mediaId];
      removed = true;
    }
    if (identity.contentKey && all[identity.contentKey]) {
      delete all[identity.contentKey];
      removed = true;
    }
    if (identity.lookupId && all[identity.lookupId]) {
      delete all[identity.lookupId];
      removed = true;
    }

    if (removed) {
      this.scheduleSave();
    }
    return removed;
  }

  markCompleted(userId: string, mediaId: string): void {
    const all = this.users.get(userId);
    if (!all) return;
    const record = this.getByMedia(userId, mediaId);
    if (record) {
      record.completed = true;
      record.at = Date.now();
      this.scheduleSave();
    }
  }

  /**
   * Returns media IDs of unfinished items for Continue Watching.
   * TV shows are grouped so only the most recently watched unfinished episode per show is returned.
   */
  getContinueWatchingIds(userId: string): string[] {
    const all = this.users.get(userId);
    if (!all) return [];

    // Filter unique canonical items that are NOT completed
    const seenShows = new Set<string>();
    const seenItems = new Set<string>();
    const candidates: Array<{ id: string; at: number }> = [];

    // Sort by most recently updated
    const sorted = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at);

    for (const [id, p] of sorted) {
      // Skip completed or empty durations
      if (p.completed || (p.d > 0 && p.t / p.d >= 0.90) || (p.d > 0 && p.d - p.t < 20)) {
        continue;
      }
      if (p.t < 5) continue; // Skip items watched for less than 5 seconds

      const identity = parseContentIdentity(id);
      const canonical = identity.contentKey;

      if (seenItems.has(canonical)) continue;
      seenItems.add(canonical);

      // For TV shows, collapse multiple episodes of the same show to the latest one
      if (identity.kind === 'tv' && identity.tmdbId) {
        const showKey = `tv-show-${identity.tmdbId}`;
        if (seenShows.has(showKey)) continue;
        seenShows.add(showKey);
      }

      // Prefer lookupId (e.g. streaming-movie-1368337 or localMediaId) for playback routing
      const targetId = p.localMediaId || identity.lookupId || id;
      candidates.push({ id: targetId, at: p.at });
    }

    return candidates.slice(0, 30).map((c) => c.id);
  }

  private scheduleSave() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void writeJsonAtomic(this.cfg.progressFile, Object.fromEntries(this.users)).catch(() => {});
    }, 2000);
    this.timer.unref();
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await writeJsonAtomic(this.cfg.progressFile, Object.fromEntries(this.users));
  }
}
