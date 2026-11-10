/**
 * Tolerant filename / folder-name parsing.
 * Handles: S02E03, s02e03e04, S02E03-E04, 2x03, "Season 2 Episode 3", "Ep 3", "E03",
 * Arabic "الموسم 2 الحلقة 3", leading numbers ("03 - Title"), trailing numbers.
 * Everything is Unicode-aware (\b doesn't work with Arabic, so we use lookarounds).
 */

const B = '(?<![\\p{L}\\p{N}])'; // "word" boundary before
const A = '(?![\\p{L}\\p{N}])'; // "word" boundary after
const re = (src: string, flags = 'iu') => new RegExp(src, flags);

const NOISE_WORDS = [
  '2160p', '1440p', '1080[pi]', '720p', '576p', '480p', '4k', 'uhd', 'hd', 'fhd',
  'web[ -]?dl', 'web[ -]?rip', 'webrip', 'web', 'blu[ -]?ray', 'brrip', 'bdrip', 'hdtv', 'dvdrip', 'hdrip', 'remux',
  'x26[45]', 'h[ ]?26[45]', 'hevc', 'avc', 'xvid', 'divx', 'av1', 'vp9',
  'aac(?:[ ]?[25][ ]?[01])?', 'ac3', 'eac3', 'dts(?:[ -]?hd)?', 'truehd', 'atmos', 'flac', 'opus', 'mp3',
  'dd\\+?[ ]?[257][ ]?[01]', 'ddp[ ]?[257][ ]?[01]', '[257][ ]1',
  '10[ -]?bit', '8[ -]?bit', 'hdr10\\+?', 'hdr', 'dv', 'dolby[ ]?vision',
  'proper', 'repack', 'extended', 'unrated', 'internal', 'multi', 'dual[ ]?audio', 'subbed', 'dubbed',
  'amzn', 'nf', 'dsnp', 'hmax', 'atvp', 'hulu', 'pcok', 'yify', 'yts', 'rarbg', 'ettv', 'eztv',
];
const NOISE = re(`${B}(?:${NOISE_WORDS.join('|')})${A}`);
const NOISE_G = re(`${B}(?:${NOISE_WORDS.join('|')})${A}`, 'giu');

const EP_WORD = '(?:episode|ep|e|الحلقة|الحلقه|حلقة|حلقه)';
const SEASON_WORD = '(?:season|series|s|الموسم|موسم)';

const P_SXE = re(`${B}s(\\d{1,2})[ ._-]?e(\\d{1,3})(?:(?:-|-?e)(\\d{1,3}))?${A}`);
const P_NXN = re(`${B}(\\d{1,2})x(\\d{1,3})(?:-(\\d{1,3}))?${A}`);
const P_WORDS = re(`${B}${SEASON_WORD}[ ._-]*(\\d{1,2})[ ._,-]*${EP_WORD}[ ._-]*(\\d{1,3})${A}`);
const P_EPISODE = re(`${B}${EP_WORD}[ ._-]*(\\d{1,3})${A}`);
const P_LEADING = re(`^[\\s#]*(\\d{1,3})(?=[\\s._-])`);
const P_TRAILING = re(`(?:^|[\\s._-])(\\d{1,3})\\s*$`);

export interface EpisodeInfo {
  season?: number;
  episode?: number;
  episodeEnd?: number;
  titleHint?: string;
  via: 'sxe' | 'nxn' | 'words' | 'episode' | 'leading' | 'trailing' | 'none';
}

const cleanSeparators = (s: string) => s.replace(/[._]+/g, ' ');

function hintFrom(rest: string): string | undefined {
  let t = rest.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ');
  t = t.replace(NOISE_G, ' ').replace(/[\s\-–—:|]+/g, ' ').trim();
  t = t.replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '');
  return t.length >= 2 && /\p{L}/u.test(t) ? t : undefined;
}

export function parseEpisodeInfo(baseName: string): EpisodeInfo {
  const text = cleanSeparators(baseName);
  const clean = text.replace(NOISE_G, ' ').replace(/\s+/g, ' ').trim();
  const done = (m: RegExpMatchArray, via: EpisodeInfo['via'], season: number | undefined, ep: number, end?: number): EpisodeInfo => ({
    season,
    episode: ep,
    episodeEnd: end !== undefined && end > ep ? end : undefined,
    titleHint: hintFrom(clean.slice((m.index ?? 0) + m[0].length)),
    via,
  });

  let m = clean.match(P_SXE);
  if (m) return done(m, 'sxe', +m[1], +m[2], m[3] ? +m[3] : undefined);
  m = clean.match(P_WORDS);
  if (m) return done(m, 'words', +m[1], +m[2]);
  m = clean.match(P_NXN);
  if (m) return done(m, 'nxn', +m[1], +m[2], m[3] ? +m[3] : undefined);
  m = clean.match(P_EPISODE);
  if (m) return done(m, 'episode', undefined, +m[1]);
  m = clean.match(P_LEADING);
  if (m) return done(m, 'leading', undefined, +m[1]);
  m = clean.match(P_TRAILING);
  if (m) return { episode: +m[1], via: 'trailing' };
  return { via: 'none' };
}

const P_SEASON_ONLY = re(`^${SEASON_WORD}[ ._-]*(\\d{1,2})$`);
const P_SEASON_IN = re(`${B}(?:season|series|s|الموسم|موسم)[ ._-]*(\\d{1,2})(?=[\\s._()\\[-]|$)`);
const P_SPECIALS = re(`^(?:specials?|extras?|الخاصة|حلقات خاصة)$`);

/** Season number from a folder name, or undefined. "Specials" → 0. */
export function parseSeasonFromName(name: string): number | undefined {
  const t = cleanSeparators(name).trim();
  if (P_SPECIALS.test(t)) return 0;
  const a = t.match(P_SEASON_ONLY);
  if (a) return +a[1];
  const b = t.match(P_SEASON_IN);
  return b ? +b[1] : undefined;
}

const SMALL = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'vs', 'or']);
function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const YEAR = /(?<![\p{L}\p{N}])((?:19|20)\d{2})(?![\p{L}\p{N}])/gu;
const SEASON_TOKEN = re(`${B}(?:s\\d{1,2}(?:e\\d{1,3})?|season[ ]*\\d+|الموسم[ ]*\\d+)${A}`);

/** "the-boys" → "The Boys"; "Inception.2010.1080p.BluRay" → {Inception, 2010}. Pass a name WITHOUT extension. */
export function parseTitle(raw: string): { title: string; year?: number } {
  const isSlug = !/[\s._]/.test(raw.trim());
  let s = cleanSeparators(raw);
  if (isSlug) s = s.replace(/-+/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

  let cut = Infinity;
  let year: number | undefined;
  const years = [...s.matchAll(YEAR)].filter((m) => (m.index ?? 0) > 0);
  const lastYear = years[years.length - 1];
  if (lastYear) {
    year = +lastYear[1];
    cut = lastYear.index!;
  }
  for (const rx of [NOISE, SEASON_TOKEN]) {
    const m = s.match(rx);
    if (m && (m.index ?? 0) > 0) cut = Math.min(cut, m.index!);
  }
  s = s.slice(0, cut).replace(/[()]/g, ' ').replace(/[\s\-–—:]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!s) s = cleanSeparators(raw).trim();
  if (s === s.toLowerCase() && /[a-z]/.test(s)) s = titleCase(s);
  return { title: s, year };
}

/** Normalises names so "the-boys", "The Boys" and "THE.BOYS" all collide (for metadata.json keys). */
export const normalizeKey = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
