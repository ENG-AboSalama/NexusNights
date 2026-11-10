import path from 'node:path';
import type { Config } from '../config';
import { readJson, shortId, writeJsonAtomic } from '../util/fsx';

export interface TmdbSearchHit {
  id: number;
  name?: string;
  original_name?: string;
  title?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  popularity?: number;
}
export interface TmdbGenre { id: number; name: string }
export interface TmdbTv {
  id: number; name: string; overview?: string; tagline?: string; genres?: TmdbGenre[];
  poster_path?: string | null; backdrop_path?: string | null; first_air_date?: string;
  vote_average?: number; status?: string;
}
export interface TmdbMovie {
  id: number; title: string; overview?: string; tagline?: string; genres?: TmdbGenre[];
  poster_path?: string | null; backdrop_path?: string | null; release_date?: string;
  runtime?: number; vote_average?: number; status?: string;
}
export interface TmdbEpisode {
  episode_number: number; 
  season_number?: number;
  name?: string; 
  overview?: string; 
  air_date?: string;
  runtime?: number | null; 
  still_path?: string | null; 
  vote_average?: number;
}
export interface TmdbSeason { 
  season_number: number; 
  name?: string; 
  overview?: string;
  poster_path?: string | null;
  air_date?: string | null;
  episode_count?: number;
  episodes?: TmdbEpisode[];
}

export interface TmdbTvDetail extends TmdbTv {
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TmdbSeason[];
  episode_run_time?: number[];
}

export interface TmdbPagedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

type Params = Record<string, string | number | undefined>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal TMDB v3 client with:
 *  - v3 API key OR v4 bearer token (auto-detected)
 *  - on-disk cache (data/cache/tmdb) with TTL, negative caching for 404s
 *  - stale-if-error: if TMDB is down we keep serving the expired cache
 *  - retry/backoff on 429 / 5xx and a hard timeout per request
 */
export class TmdbClient {
  constructor(private cfg: Config) {}

  get enabled(): boolean {
    return !!this.cfg.tmdb.apiKey;
  }

  private async request<T>(endpoint: string, params: Params = {}): Promise<T | null> {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const file = path.join(this.cfg.cacheDir, 'tmdb', `${shortId(endpoint + JSON.stringify(entries), 24)}.json`);
    const cached = await readJson<{ fetchedAt: number; data: T | null }>(file);
    const ttl = this.cfg.tmdb.cacheDays * 86_400_000;
    if (cached && Date.now() - cached.fetchedAt < ttl) return cached.data;

    try {
      const data = await this.fetchJson<T>(endpoint, entries);
      await writeJsonAtomic(file, { fetchedAt: Date.now(), data });
      return data;
    } catch (e) {
      if (cached) return cached.data; // stale-if-error
      throw e;
    }
  }

  private async fetchJson<T>(endpoint: string, entries: [string, string | number | undefined][]): Promise<T | null> {
    const key = this.cfg.tmdb.apiKey!;
    const url = new URL(this.cfg.tmdb.baseUrl + endpoint);
    for (const [k, v] of entries) url.searchParams.set(k, String(v));
    const bearer = key.length > 60 && key.includes('.');
    if (!bearer) url.searchParams.set('api_key', key);

    let lastErr: Error = new Error('TMDB request failed');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { accept: 'application/json', ...(bearer ? { authorization: `Bearer ${key}` } : {}) },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 404) return null;
        if (res.status === 429) {
          const wait = Math.min(10, Number(res.headers.get('retry-after')) || 2);
          lastErr = new Error('TMDB rate limited');
          await sleep(wait * 1000);
          continue;
        }
        if (res.status === 401) throw Object.assign(new Error('TMDB rejected the API key (401)'), { fatal: true });
        if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
        return (await res.json()) as T;
      } catch (e) {
        lastErr = e as Error;
        if ((e as { fatal?: boolean }).fatal) throw e;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  async search(kind: 'tv' | 'movie', query: string, year?: number): Promise<TmdbSearchHit[]> {
    const lang = this.cfg.tmdb.languages[0] ?? 'en-US';
    const r = await this.request<{ results: TmdbSearchHit[] }>(`/search/${kind}`, {
      query,
      language: lang,
      include_adult: 'false',
      ...(year ? (kind === 'tv' ? { first_air_date_year: year } : { year }) : {}),
    });
    return r?.results ?? [];
  }

  tv(id: number, language: string) {
    return this.request<TmdbTv>(`/tv/${id}`, { language });
  }
  movie(id: number, language: string) {
    return this.request<TmdbMovie>(`/movie/${id}`, { language });
  }
  season(id: number, season: number, language: string) {
    return this.request<TmdbSeason>(`/tv/${id}/season/${season}`, { language });
  }

  // ── Global Discovery Methods ───────────────────────────────────────────────

  async getTrendingMovies(timeWindow: 'day' | 'week' = 'day', page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>(`/trending/movie/${timeWindow}`, { page, language: lang });
  }

  async getTrendingTv(timeWindow: 'day' | 'week' = 'day', page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>(`/trending/tv/${timeWindow}`, { page, language: lang });
  }

  async getPopularMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>('/movie/popular', { page, language: lang });
  }

  async getPopularTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>('/tv/popular', { page, language: lang });
  }

  async getMovie(id: number) {
    const lang = this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbMovie>(`/movie/${id}`, { language: lang });
  }

  async getTv(id: number) {
    const lang = this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbTv>(`/tv/${id}`, { language: lang });
  }

  // ── Extended Discovery Methods (Stage 5) ───────────────────────────────────

  async getTopRatedMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/movie/top_rated', { page, language: lang });
  }

  async getTopRatedTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/tv/top_rated', { page, language: lang });
  }

  async getNowPlayingMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/movie/now_playing', { page, language: lang });
  }

  async getUpcomingMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/movie/upcoming', { page, language: lang });
  }

  async getOnTheAirTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/tv/on_the_air', { page, language: lang });
  }

  async getAiringTodayTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/tv/airing_today', { page, language: lang });
  }

  async searchMulti(query: string, page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit & { media_type?: 'movie' | 'tv' }>>('/search/multi', {
      query,
      page,
      language: lang,
      include_adult: 'false'
    });
  }

  async getTvDetail(id: number, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbTvDetail>(`/tv/${id}`, { language: lang });
  }

  async getMovieDetail(id: number, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbMovie>(`/movie/${id}`, { language: lang });
  }

  async getSeasonDetail(tvId: number, seasonNumber: number, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbSeason>(`/tv/${tvId}/season/${seasonNumber}`, { language: lang });
  }

  async getImageConfig() {
    return this.request<{
      images: {
        secure_base_url: string;
        backdrop_sizes: string[];
        poster_sizes: string[];
        still_sizes: string[];
      }
    }>('/configuration');
  }
}
