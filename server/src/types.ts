/** Internal index model. Never sent to clients as-is (it contains relative file paths). */

export type Localized<T> = Record<string, T>; // keys: 'en', 'ar', ... or '*' (language-neutral)

export interface LocalizedText {
  title?: string;
  overview?: string;
  tagline?: string;
  genres?: string[];
}

export interface AudioTrack {
  index: number; // ffmpeg stream index
  ord: number; // nth audio stream (0-based)
  codec: string;
  channels?: number;
  lang?: string;
  label?: string;
  default: boolean;
}

export interface EmbeddedSub {
  index: number;
  ord: number; // nth subtitle stream (0-based) → ffmpeg -map 0:s:ord
  codec: string;
  lang?: string;
  label?: string;
  textBased: boolean;
  forced: boolean;
  default: boolean;
}

export interface VideoInfo {
  codec: string;
  profile?: string;
  width: number;
  height: number;
  pixFmt?: string;
  fps?: number;
}

export interface Probe {
  durationSec: number;
  container: string;
  bitrate?: number;
  video?: VideoInfo;
  audio: AudioTrack[];
  subs: EmbeddedSub[];
}

export interface SubtitleFile {
  relPath: string;
  ext: 'srt' | 'vtt' | 'ass' | 'ssa';
  lang?: string;
  label: string;
  forced: boolean;
  sdh: boolean;
  size: number;
  mtimeMs: number;
}

export interface SpriteInfo {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  intervalSec: number;
  count: number;
}

/** How the player should get bytes to the browser. Stage 2 executes this plan. */
export interface Playback {
  mode: 'direct' | 'hls';
  video: 'copy' | 'transcode';
  audio: 'copy' | 'transcode';
  reasons: string[];
}

export interface EpisodeMeta {
  i18n: Localized<{ title?: string; overview?: string }>;
  airDate?: string;
  runtimeMin?: number;
  stillPath?: string; // TMDB path
  stillFile?: string; // file inside data/overrides
  rating?: number;
}

export interface MediaItem {
  id: string;
  titleId: string;
  season?: number;
  episode?: number;
  episodeEnd?: number;
  titleHint?: string;
  relPath: string;
  fileName: string;
  size: number;
  mtimeMs: number;
  subtitleFiles: SubtitleFile[];
  probe?: Probe;
  playback?: Playback;
  probeError?: string;
  meta?: EpisodeMeta;
  assets: { thumb: boolean; sprite?: SpriteInfo };
}

export interface TitleMeta {
  source: 'tmdb' | 'override' | 'mixed' | 'derived';
  tmdbId?: number;
  i18n: Localized<LocalizedText>;
  year?: number;
  posterPath?: string;
  backdropPath?: string;
  posterFile?: string;
  backdropFile?: string;
  rating?: number;
  status?: string;
  seasonNames?: Record<number, Localized<string>>;
}

export interface Title {
  id: string;
  kind: 'series' | 'movie';
  folderKey: string;
  nameGuess: string;
  yearGuess?: number;
  addedAt: number;
  meta?: TitleMeta;
}

export interface IndexFile {
  version: 1;
  scannedAt: string | null;
  titles: Title[];
  media: MediaItem[];
}

export type ScanPhase = 'discover' | 'probe' | 'metadata' | 'thumbs';

export interface ScanStatus {
  state: 'idle' | 'scanning';
  phase: ScanPhase | null;
  done: number;
  total: number;
  startedAt: number | null;
  finishedAt: number | null;
  warnings: string[];
}
