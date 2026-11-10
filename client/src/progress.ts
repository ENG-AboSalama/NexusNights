/**
 * Universal Watch Progress ("Continue Watching").
 *  - Mirrors to memory + localStorage (supports guest / browser sessions).
 *  - In Discord Activity mode (access token present), syncs to the backend per authenticated Discord user.
 *  - Works uniformly across Local Player, direct HLS/MP4, and all external streaming providers.
 *  - Stable content identity: TMDB ID for movies & series (collapsing providers without duplicate history).
 */
import { BASE } from './api';

export interface Progress {
  t: number;                  // Playback position in seconds
  d: number;                  // Total duration in seconds
  at: number;                 // Timestamp when progress was recorded
  provider?: string;          // 'local', 'VixSrc', 'VidAPI', etc.
  contentKey?: string;        // Canonical key (e.g. 'movie-1368337', 'tv-76479-s1e1')
  tmdbId?: number | null;
  kind?: 'movie' | 'tv' | null;
  season?: number | null;
  episode?: number | null;
  completed?: boolean;
  localMediaId?: string | null;
}

const KEY = 'umbra:progress';

export function parseContentId(id: string): {
  contentKey: string;
  lookupId: string;
  tmdbId: number | null;
  kind: 'movie' | 'tv' | null;
  season: number | null;
  episode: number | null;
} {
  if (id.startsWith('streaming-movie-')) {
    const tmdbId = parseInt(id.replace('streaming-movie-', ''), 10);
    return {
      contentKey: `movie-${tmdbId}`,
      lookupId: id,
      tmdbId: isNaN(tmdbId) ? null : tmdbId,
      kind: 'movie',
      season: null,
      episode: null,
    };
  }
  if (id.startsWith('streaming-tv-')) {
    const parts = id.replace('streaming-tv-', '').split('-');
    const tmdbId = parseInt(parts[0], 10);
    const season = parseInt(parts[1], 10);
    const episode = parseInt(parts[2], 10);
    return {
      contentKey: `tv-${tmdbId}-s${season}e${episode}`,
      lookupId: id,
      tmdbId: isNaN(tmdbId) ? null : tmdbId,
      kind: 'tv',
      season: isNaN(season) ? null : season,
      episode: isNaN(episode) ? null : episode,
    };
  }
  if (id.startsWith('movie-')) {
    const tmdbId = parseInt(id.replace('movie-', ''), 10);
    return {
      contentKey: id,
      lookupId: `streaming-movie-${tmdbId}`,
      tmdbId: isNaN(tmdbId) ? null : tmdbId,
      kind: 'movie',
      season: null,
      episode: null,
    };
  }
  const tvM = /^tv-(\d+)-s(\d+)e(\d+)$/.exec(id);
  if (tvM) {
    const tmdbId = parseInt(tvM[1], 10);
    const season = parseInt(tvM[2], 10);
    const episode = parseInt(tvM[3], 10);
    return {
      contentKey: id,
      lookupId: `streaming-tv-${tmdbId}-${season}-${episode}`,
      tmdbId,
      kind: 'tv',
      season,
      episode,
    };
  }
  return {
    contentKey: id,
    lookupId: id,
    tmdbId: null,
    kind: null,
    season: null,
    episode: null,
  };
}

function readLocal(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Progress>;
  } catch {
    return {};
  }
}

function writeLocal(v: Record<string, Progress>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage blocked in some iframe sandbox environments */
  }
}

let cache: Record<string, Progress> = readLocal();
let token: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const dirty = new Map<string, Progress>();
let flushTimer: number | undefined;

const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

export const subscribeProgress = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const progressVersion = () => version;

/** Completion threshold: >= 90% watched or remaining runtime < 20s */
export const isFinished = (p: Progress) =>
  Boolean(p.completed) || (p.d > 0 && (p.t / p.d >= 0.90 || p.d - p.t < 20));

export function setProgressAuth(accessToken: string | null) {
  token = accessToken;
  if (!token) return;
  fetch(BASE + '/api/progress', { headers: { authorization: `Bearer ${token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { progress: Record<string, Progress> } | null) => {
      if (!j) return;
      for (const [id, p] of Object.entries(j.progress)) {
        if (!cache[id] || cache[id].at < p.at) {
          cache[id] = p;
        }
      }
      writeLocal(cache);
      bump();
    })
    .catch(() => {
      /* offline / local fallback */
    });
}

function scheduleFlush() {
  if (!token || flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushProgressNow();
  }, 4000);
}

export function flushProgressNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  const t = token;
  if (!t || dirty.size === 0) return;

  for (const [id, p] of dirty) {
    const payload = JSON.stringify({
      t: p.t,
      d: p.d,
      provider: p.provider,
      completed: p.completed,
      tmdbId: p.tmdbId,
      kind: p.kind,
      season: p.season,
      episode: p.episode,
    });

    fetch(`${BASE}/api/progress/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
  dirty.clear();
}

// Ensure pending progress is persisted on page exit or visibility change
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => flushProgressNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushProgressNow();
    }
  });
}

export function saveProgress(
  id: string,
  t: number,
  d: number,
  meta?: Partial<Progress>
) {
  if (!Number.isFinite(t) || !Number.isFinite(d) || d <= 0 || t < 5) return;

  const identity = parseContentId(id);
  const timeSec = Math.floor(t);
  const durSec = Math.floor(d);
  const completed = meta?.completed ?? isFinished({ t: timeSec, d: durSec, at: 0 });

  const p: Progress = {
    t: timeSec,
    d: durSec,
    at: Date.now(),
    provider: meta?.provider,
    contentKey: identity.contentKey,
    tmdbId: meta?.tmdbId ?? identity.tmdbId,
    kind: meta?.kind ?? identity.kind,
    season: meta?.season ?? identity.season,
    episode: meta?.episode ?? identity.episode,
    completed,
    localMediaId: meta?.localMediaId,
  };

  // Update in-memory cache under requested ID and canonical contentKey
  cache[id] = p;
  if (identity.contentKey && identity.contentKey !== id) {
    cache[identity.contentKey] = p;
  }
  if (identity.lookupId && identity.lookupId !== id) {
    cache[identity.lookupId] = p;
  }
  if (p.localMediaId && p.localMediaId !== id) {
    cache[p.localMediaId] = p;
  }

  // Keep up to 100 recent entries in localStorage
  const keep = Object.entries(cache)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 100);
  cache = Object.fromEntries(keep);
  writeLocal(cache);

  dirty.set(id, p);
  bump();
  scheduleFlush();
}

export const getProgress = (id: string): Progress | undefined => {
  if (cache[id]) return cache[id];
  const identity = parseContentId(id);
  if (identity.contentKey && cache[identity.contentKey]) return cache[identity.contentKey];
  if (identity.lookupId && cache[identity.lookupId]) return cache[identity.lookupId];
  return undefined;
};

export const allProgress = (): Record<string, Progress> => cache;

/**
 * Returns IDs of unfinished items, most recently watched first.
 * For TV shows, prioritizes only the most recently watched unfinished episode per show.
 */
export function continueIds(): string[] {
  const seenShows = new Set<string>();
  const seenItems = new Set<string>();
  const results: string[] = [];

  const sorted = Object.entries(cache).sort((a, b) => b[1].at - a[1].at);

  for (const [id, p] of sorted) {
    if (isFinished(p) || p.t < 5) continue;

    const identity = parseContentId(id);
    const canonical = identity.contentKey;

    if (seenItems.has(canonical)) continue;
    seenItems.add(canonical);

    // Group TV episodes of the same show
    if (identity.kind === 'tv' && identity.tmdbId) {
      const showKey = `tv-${identity.tmdbId}`;
      if (seenShows.has(showKey)) continue;
      seenShows.add(showKey);
    }

    // Prefer lookupId (e.g. streaming-movie-1368337 or local ID) for router playback
    const targetId = p.localMediaId || identity.lookupId || id;
    results.push(targetId);
  }

  return results.slice(0, 20);
}
