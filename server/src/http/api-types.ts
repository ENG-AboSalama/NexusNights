/** Public API shapes (no file paths, no internals). Stage 2 copies this file into the client. */

export interface TitleSummary {
  id: string;
  kind: 'series' | 'movie';
  title: string;
  year: number | null;
  overview: string;
  tagline: string | null;
  genres: string[];
  rating: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  seasonCount: number;
  episodeCount: number;
  addedAt: number;
  /** Movies only: the media id to play. */
  mediaId: string | null;
  /** First episode (series) or the movie itself — what the hero "Play" button starts. */
  firstMediaId: string | null;
  runtimeSec: number | null;
}

export interface EpisodeSummary {
  id: string;
  titleId: string;
  titleName: string;
  kind: 'series' | 'movie';
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  title: string;
  overview: string;
  airDate: string | null;
  runtimeSec: number | null;
  stillUrl: string | null;
  thumbUrl: string | null;
  /** false while ffprobe hasn't finished or failed → UI shows the item greyed out. */
  playable: boolean;
}

export interface SubtitleTrackInfo {
  id: string; // "ext-0" | "emb-1"
  lang: string | null;
  label: string;
  source: 'external' | 'embedded';
  forced: boolean;
  url: string;
}

export interface AudioTrackInfo {
  index: number; // 0-based among audio streams
  lang: string | null;
  label: string;
  channels: number | null;
  default: boolean;
}

export interface SpriteInfoPublic {
  url: string;
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  intervalSec: number;
  count: number;
}

export interface EpisodeDetail extends EpisodeSummary {
  width: number | null;
  height: number | null;
  playback: { mode: 'direct' | 'hls'; video: 'copy' | 'transcode'; audio: 'copy' | 'transcode' } | null;
  playbackError?: 'media_not_ready' | 'media_tools_missing' | 'media_probe_failed';
  audioTracks: AudioTrackInfo[];
  subtitles: SubtitleTrackInfo[];
  sprite: SpriteInfoPublic | null;
  prevId: string | null;
  nextId: string | null;
  /** TMDB metadata for streaming fallback */
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
}

export interface SeasonBlock {
  season: number;
  name: string | null;
  episodes: EpisodeSummary[];
}

export interface TitleDetail extends TitleSummary {
  seasons: SeasonBlock[];
}

export interface HomeRow {
  key: 'episodes' | 'recently-added' | 'continue-watching';
  kind: 'episode' | 'title';
  items: Array<EpisodeSummary | TitleSummary>;
}

export interface HomeResponse {
  hero: TitleSummary | null;
  rows: HomeRow[];
}

export interface ScanStatusPublic {
  state: 'idle' | 'scanning';
  phase: string | null;
  done: number;
  total: number;
  scannedAt: string | null;
  warningCount: number;
  titleCount: number;
  mediaCount: number;
}

// ─── Playback API Types ───────────────────────────────────────────────────

export interface PlaybackSourcePublic {
  url: string;
  type: 'hls' | 'mp4' | 'dash' | 'embed';
  quality: string;
  provider: string;
  audioTracks?: Array<{ language: string; label: string }>;
  embedUrl?: string; // Present when type === 'embed'
}

export interface PlaybackSubtitlePublic {
  url: string;
  language: string;
  label: string;
}

export interface PlaybackConfigPublic {
  source: PlaybackSourcePublic | null;
  alternatives: PlaybackSourcePublic[];
  subtitles: PlaybackSubtitlePublic[];
  canAutoSwitch: boolean;
  hasLocal: boolean;
  localMediaId: string | null;
  diagnosticsCount: number;
}

export interface PlaybackResponse {
  playback: PlaybackConfigPublic;
  title: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseYear: number | null;
}

// ─── Global Discovery Types ────────────────────────────────────────────────

export interface GlobalTitleCard {
  id: string; // `movie-${tmdbId}` or `tv-${tmdbId}` or local ID
  tmdbId: number;
  kind: 'movie' | 'series';
  title: string;
  originalTitle: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  rating: number | null;
  year: number | null;
  availability: 'local' | 'stream' | 'discover';
  localId?: string; // Present if availability is 'local'
}

export interface GlobalHomeResponse {
  hero: GlobalTitleCard | null;
  sections: GlobalHomeSection[];
}

export interface GlobalHomeSection {
  key: string;
  title: string;
  items: GlobalTitleCard[];
}

export interface GlobalTitleDetail {
  tmdbId: number;
  kind: 'movie' | 'series';
  title: string;
  originalTitle: string;
  overview: string;
  tagline: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  rating: number | null;
  year: number | null;
  genres: string[];
  runtime: number | null;
  status: string;
  availability: 'local' | 'stream' | 'discover';
  localId?: string;
  // TV-specific
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  seasons?: GlobalSeason[];
}

export interface GlobalSeason {
  seasonNumber: number;
  name: string;
  overview: string;
  posterUrl: string | null;
  airDate: string | null;
  episodeCount: number;
  episodes?: GlobalEpisode[];
}

export interface GlobalEpisode {
  tmdbId: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  stillUrl: string | null;
  airDate: string | null;
  runtime: number | null;
  rating: number | null;
  availability: 'local' | 'stream' | 'discover';
  localMediaId?: string;
}

export interface GlobalSearchResponse {
  query: string;
  local: GlobalTitleCard[];
  global: GlobalTitleCard[];
  totalResults: number;
}
