import fs from 'node:fs/promises';
import path from 'node:path';
import type { SubtitleFile } from '../types';
import { isInside, naturalCompare, toPosix } from '../util/fsx';
import { parseEpisodeInfo, parseSeasonFromName, parseTitle } from './parse';
import { matchSubtitles, type SubFileEntry } from './subtitles';

export const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.ts', '.wmv', '.flv', '.mpg', '.mpeg']);
export const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa']);

const IGNORE = /^(?:\.|@eaDir$|\$RECYCLE\.BIN$|System Volume Information$|lost\+found$|samples?$)/i;
const MOVIE_COLLECTION = /^(?:movies?|films?|أفلام|افلام)$/i;
const MAX_DEPTH = 8;

export interface ScannedItem {
  relPath: string;
  fileName: string;
  size: number;
  mtimeMs: number;
  season?: number;
  episode?: number;
  episodeEnd?: number;
  titleHint?: string;
  subs: SubtitleFile[];
}

export interface ScannedTitle {
  folderKey: string;
  kind: 'series' | 'movie';
  nameGuess: string;
  yearGuess?: number;
  items: ScannedItem[];
}

interface FileEntry extends SubFileEntry {
  isVideo: boolean;
}

const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

async function collect(rootReal: string, abs: string, rel: string, depth: number, out: FileEntry[], warnings: string[]) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch (e) {
    warnings.push(`Cannot read folder "${rel || '/'}": ${(e as Error).message.split(',')[0]}`);
    return;
  }
  entries.sort((a, b) => naturalCompare(a.name, b.name));
  for (const ent of entries) {
    if (IGNORE.test(ent.name)) continue;
    const childAbs = path.join(abs, ent.name);
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    let isDir = ent.isDirectory();
    let isFile = ent.isFile();
    let statPath = childAbs;
    if (ent.isSymbolicLink()) {
      try {
        const real = await fs.realpath(childAbs);
        if (!isInside(rootReal, real)) {
          warnings.push(`Skipped symlink pointing outside the media folder: "${childRel}"`);
          continue;
        }
        const st = await fs.stat(real);
        isDir = st.isDirectory();
        isFile = st.isFile();
        statPath = real;
      } catch {
        continue; // dangling link
      }
    }
    if (isDir) {
      await collect(rootReal, childAbs, childRel, depth + 1, out, warnings);
    } else if (isFile) {
      const ext = path.extname(ent.name).toLowerCase();
      const isVideo = VIDEO_EXT.has(ext);
      if (!isVideo && !SUB_EXT.has(ext)) continue;
      const st = await fs.stat(statPath);
      out.push({ rel: childRel, name: ent.name, ext, size: st.size, mtimeMs: st.mtimeMs, isVideo });
    }
  }
}

const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');

function movieFrom(video: FileEntry, folderKey: string, nameSource: string, subs: FileEntry[], videosInDir: number): ScannedTitle {
  const { title, year } = parseTitle(baseName(nameSource));
  return {
    folderKey,
    kind: 'movie',
    nameGuess: title,
    yearGuess: year,
    items: [
      {
        relPath: video.rel,
        fileName: video.name,
        size: video.size,
        mtimeMs: video.mtimeMs,
        subs: matchSubtitles(video, subs, videosInDir === 1),
      },
    ],
  };
}

function buildSeries(folder: string, videos: FileEntry[], subs: FileEntry[], warnings: string[]): ScannedTitle {
  const { title, year } = parseTitle(folder);
  const folderSeason = parseSeasonFromName(folder);
  const perDir = new Map<string, number>();
  for (const v of videos) perDir.set(dirOf(v.rel), (perDir.get(dirOf(v.rel)) ?? 0) + 1);

  type Row = { v: FileEntry; season: number; episode?: number; end?: number; hint?: string; guessed: boolean };
  const rows: Row[] = videos.map((v) => {
    const info = parseEpisodeInfo(baseName(v.name));
    let season = info.season;
    if (season === undefined) {
      const segs = v.rel.split('/').slice(1, -1).reverse();
      for (const seg of segs) {
        season = parseSeasonFromName(seg);
        if (season !== undefined) break;
      }
    }
    season ??= folderSeason ?? 1;
    return { v, season, episode: info.episode, end: info.episodeEnd, hint: info.titleHint, guessed: false };
  });

  // Fill unparsed episodes by natural file order, per season, avoiding numbers already taken.
  const bySeason = new Map<number, Row[]>();
  for (const r of rows) bySeason.set(r.season, [...(bySeason.get(r.season) ?? []), r]);
  for (const [season, list] of bySeason) {
    const used = new Set(list.filter((r) => r.episode !== undefined).map((r) => r.episode!));
    const unparsed = list.filter((r) => r.episode === undefined).sort((a, b) => naturalCompare(a.v.rel, b.v.rel));
    let next = 1;
    for (const r of unparsed) {
      while (used.has(next)) next++;
      r.episode = next;
      r.guessed = true;
      used.add(next);
    }
    if (unparsed.length) warnings.push(`"${folder}" S${String(season).padStart(2, '0')}: ${unparsed.length} file(s) had no episode number; numbered by file order`);
  }

  // Duplicates (same S/E): keep the biggest file.
  const best = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.season}:${r.episode}`;
    const cur = best.get(key);
    if (!cur) best.set(key, r);
    else {
      const [keep, drop] = r.v.size > cur.v.size ? [r, cur] : [cur, r];
      best.set(key, keep);
      warnings.push(`Duplicate S${keep.season}E${keep.episode} in "${folder}": ignoring "${drop.v.name}"`);
    }
  }

  const items = [...best.values()]
    .sort((a, b) => a.season - b.season || a.episode! - b.episode!)
    .map<ScannedItem>((r) => ({
      relPath: r.v.rel,
      fileName: r.v.name,
      size: r.v.size,
      mtimeMs: r.v.mtimeMs,
      season: r.season,
      episode: r.episode,
      episodeEnd: r.end,
      titleHint: r.guessed ? undefined : r.hint,
      subs: matchSubtitles(r.v, subs, perDir.get(dirOf(r.v.rel)) === 1),
    }));
  return { folderKey: folder, kind: 'series', nameGuess: title, yearGuess: year, items };
}

export async function discover(mediaDir: string): Promise<{ titles: ScannedTitle[]; warnings: string[] }> {
  const warnings: string[] = [];
  let rootReal: string;
  try {
    rootReal = await fs.realpath(mediaDir);
  } catch {
    return { titles: [], warnings: ['MEDIA_PATH does not exist or is not readable'] };
  }

  const files: FileEntry[] = [];
  await collect(rootReal, rootReal, '', 0, files, warnings);

  const rootFiles: FileEntry[] = [];
  const groups = new Map<string, FileEntry[]>();
  for (const f of files) {
    const i = f.rel.indexOf('/');
    if (i < 0) rootFiles.push(f);
    else {
      const g = f.rel.slice(0, i);
      groups.set(g, [...(groups.get(g) ?? []), f]);
    }
  }

  const titles: ScannedTitle[] = [];

  // Loose files in the media root → one movie each.
  const rootVideos = rootFiles.filter((f) => f.isVideo);
  const rootSubs = rootFiles.filter((f) => !f.isVideo);
  for (const v of rootVideos) titles.push(movieFrom(v, baseName(v.name), v.name, rootSubs, 2));

  for (const [folder, group] of [...groups].sort((a, b) => naturalCompare(a[0], b[0]))) {
    const videos = group.filter((f) => f.isVideo);
    const subs = group.filter((f) => !f.isVideo);
    if (!videos.length) continue;

    if (MOVIE_COLLECTION.test(folder)) {
      for (const v of videos) titles.push(movieFrom(v, baseName(v.rel), v.name, subs, 2));
      continue;
    }

    const infos = videos.map((v) => parseEpisodeInfo(baseName(v.name)));
    const hasEpisodeNumbers = infos.some((i) => i.episode !== undefined);
    const hasSeasonHint =
      parseSeasonFromName(folder) !== undefined ||
      videos.some((v) => v.rel.split('/').slice(1, -1).some((seg) => parseSeasonFromName(seg) !== undefined));

    if (videos.length === 1 && !hasEpisodeNumbers && !hasSeasonHint) {
      titles.push(movieFrom(videos[0], folder, folder, subs, 1));
    } else {
      titles.push(buildSeries(folder, videos, subs, warnings));
    }
  }

  // Normalise any Windows separators that slipped in (defensive; collect() already builds POSIX paths).
  for (const t of titles) for (const it of t.items) it.relPath = toPosix(it.relPath);
  return { titles, warnings };
}
