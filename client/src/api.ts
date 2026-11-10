import type {
  EpisodeDetail,
  EpisodeSummary,
  HlsStatus,
  HomeResponse,
  PlaybackResponse,
  ScanStatusPublic,
  TitleDetail,
  GlobalHomeResponse,
  GlobalTitleDetail,
  GlobalSeason,
  GlobalSearchResponse,
  ProvidersResponse,
  ProviderToggleResponse,
  ProviderTestResultPublic,
  ResetCooldownsResponse,
} from './api-types';

// No more Discord Activity - direct API access
export const BASE = '';

export function u(path: string): string;
export function u(path: string | null | undefined): string | undefined;
export function u(path: string | null | undefined): string | undefined {
  return path ?? undefined;
}

export class ApiError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(BASE + path, { signal, headers: { accept: 'application/json' } });
  if (!r.ok) throw new ApiError(r.status);
  return (await r.json()) as T;
}

export const api = {
  home: (lang: string, signal?: AbortSignal) => get<HomeResponse>(`/api/home?lang=${lang}`, signal),
  title: (id: string, lang: string, signal?: AbortSignal) => get<TitleDetail>(`/api/titles/${id}?lang=${lang}`, signal),
  media: (id: string, lang: string, signal?: AbortSignal) => get<EpisodeDetail>(`/api/media/${id}?lang=${lang}`, signal),
  batch: (ids: string[], lang: string, signal?: AbortSignal) =>
    ids.length ? get<{ items: EpisodeSummary[] }>(`/api/media?ids=${ids.join(',')}&lang=${lang}`, signal) : Promise.resolve({ items: [] }),
  hlsStatus: (id: string, signal?: AbortSignal) => get<HlsStatus>(`/api/hls/${id}/status`, signal),
  libraryStatus: (signal?: AbortSignal) => get<ScanStatusPublic>('/api/library/status', signal),
  config: () => get<{ guestAllowed: boolean }>('/api/config'),
  
  // ── Streaming Playback (Stage 4) ──
  playbackMovie: (tmdbId: number, lang: string, signal?: AbortSignal) => 
    get<PlaybackResponse>(`/api/playback/movie/${tmdbId}?lang=${lang}`, signal),
  playbackTV: (tmdbId: number, season: number, episode: number, lang: string, signal?: AbortSignal) =>
    get<PlaybackResponse>(`/api/playback/tv/${tmdbId}/seasons/${season}/episodes/${episode}?lang=${lang}`, signal),

  // ── Global Discovery (Stage 5) ──
  discoveryHome: (lang: string, signal?: AbortSignal) => 
    get<GlobalHomeResponse>(`/api/discovery/home?lang=${lang}`, signal),
  discoveryMovie: (tmdbId: number, lang: string, signal?: AbortSignal) =>
    get<GlobalTitleDetail>(`/api/discovery/movie/${tmdbId}?lang=${lang}`, signal),
  discoveryTV: (tmdbId: number, lang: string, signal?: AbortSignal) =>
    get<GlobalTitleDetail>(`/api/discovery/tv/${tmdbId}?lang=${lang}`, signal),
  discoverySeason: (tmdbId: number, season: number, lang: string, signal?: AbortSignal) =>
    get<GlobalSeason>(`/api/discovery/tv/${tmdbId}/season/${season}?lang=${lang}`, signal),
  search: (query: string, lang: string, page: number, signal?: AbortSignal) =>
    get<GlobalSearchResponse>(`/api/search?q=${encodeURIComponent(query)}&lang=${lang}&page=${page}`, signal),

  // ── Provider Health (Stage 6) ──
  reportPlaybackFailure: (report: {
    provider: string;
    sourceUrl: string;
    failureType: string;
    responseStatus?: number;
    errorDetails?: string;
  }) => {
    return fetch(BASE + '/api/playback/report-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to report')));
  },

  reportPlaybackSuccess: (report: { provider: string; sourceUrl: string }) => {
    return fetch(BASE + '/api/playback/report-success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to report')));
  },

  // ── Provider Management ──
  getProviders: (signal?: AbortSignal) =>
    get<ProvidersResponse>('/api/streaming/providers', signal),

  toggleProvider: async (id: string, enabled?: boolean): Promise<ProviderToggleResponse> => {
    const r = await fetch(BASE + `/api/streaming/providers/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(typeof enabled === 'boolean' ? { enabled } : {}),
    });
    if (!r.ok) throw new ApiError(r.status);
    return r.json();
  },

  testProvider: async (
    id: string,
    options?: { tmdbId?: number; kind?: 'movie' | 'series'; season?: number; episode?: number }
  ): Promise<ProviderTestResultPublic> => {
    const r = await fetch(BASE + `/api/streaming/providers/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!r.ok) throw new ApiError(r.status);
    return r.json();
  },

  resetProviderCooldowns: async (): Promise<ResetCooldownsResponse> => {
    const r = await fetch(BASE + '/api/streaming/providers/reset-cooldowns', {
      method: 'POST',
      headers: { accept: 'application/json' },
    });
    if (!r.ok) throw new ApiError(r.status);
    return r.json();
  },
};

export async function exchangeToken(code: string): Promise<string> {
  const r = await fetch(BASE + '/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new ApiError(r.status);
  return ((await r.json()) as { access_token: string }).access_token;
}
