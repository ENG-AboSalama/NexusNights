import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { MediaItem, SubtitleFile } from '../types';
import { langFromToken, langLabel } from '../util/lang';
import { run } from '../util/run';
import { Limiter } from '../util/limiter';
import { exists, fingerprint, safeJoin, writeFileAtomic } from '../util/fsx';
import { parseEpisodeInfo } from './parse';

export interface SubFileEntry {
  rel: string;
  name: string;
  ext: string;
  size: number;
  mtimeMs: number;
}

const SUBS_DIR = /^(?:subs?|subtitles?|captions?|ترجمة|ترجمات)$/i;
const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');

/** Finds sidecar subtitles for one video: same folder + a Subs/ sub-folder (release-group layout). */
export function matchSubtitles(
  video: { rel: string; name: string },
  subs: SubFileEntry[],
  singleVideoInDir: boolean,
): SubtitleFile[] {
  const vDir = dirOf(video.rel);
  const vBase = stripExt(video.name).toLowerCase();
  const vInfo = parseEpisodeInfo(vBase);
  const found: SubtitleFile[] = [];

  for (const s of subs) {
    const sDir = dirOf(s.rel);
    const sBase = stripExt(s.name).toLowerCase();
    let matched = false;
    let tokenSource = sBase;

    if (sDir === vDir) {
      if (sBase === vBase) matched = true;
      else if (sBase.startsWith(vBase) && /^[\s._-]/.test(sBase.slice(vBase.length))) {
        matched = true;
        tokenSource = sBase.slice(vBase.length);
      }
    } else if (vDir === '' || sDir.startsWith(vDir + '/')) {
      const tail = vDir === '' ? sDir : sDir.slice(vDir.length + 1);
      if (SUBS_DIR.test(tail.split('/')[0])) {
        const sInfo = parseEpisodeInfo(`${tail} ${sBase}`);
        const sameEp = vInfo.episode !== undefined && vInfo.episode === sInfo.episode && vInfo.season === sInfo.season;
        matched = sBase.includes(vBase) || tail.toLowerCase().includes(vBase) || sameEp || singleVideoInDir;
      }
    }
    if (!matched) continue;

    const tokens = tokenSource.split(/[\s._\-()[\]]+/).filter(Boolean);
    let lang: string | undefined;
    for (const t of tokens) {
      lang = langFromToken(t);
      if (lang) break;
    }
    const forced = tokens.includes('forced');
    const sdh = tokens.some((t) => ['sdh', 'cc', 'hi'].includes(t));
    const ext = s.ext.slice(1).toLowerCase() as SubtitleFile['ext'];
    const label = `${langLabel(lang) ?? 'Subtitles'}${sdh ? ' (SDH)' : ''}${forced ? ' (Forced)' : ''}`;
    found.push({ relPath: s.rel, ext, lang, label, forced, sdh, size: s.size, mtimeMs: s.mtimeMs });
  }

  // "English", "English 2", ... so the player menu is unambiguous.
  const seen = new Map<string, number>();
  for (const f of found) {
    const n = (seen.get(f.label) ?? 0) + 1;
    seen.set(f.label, n);
    if (n > 1) f.label = `${f.label} ${n}`;
  }
  return found;
}

// ── conversion ────────────────────────────────────────────────────────────────

/** Decode with BOM sniffing; fall back to windows-1256 (Arabic) / windows-1252 when not valid UTF-8. */
export function decodeSubtitle(buf: Buffer, lang?: string): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder(lang === 'ar' ? 'windows-1256' : 'windows-1252').decode(buf);
  }
}

export function srtToVtt(text: string): string {
  const t = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (t.startsWith('WEBVTT')) return t + '\n';
  const body = t
    .split('\n')
    .map((line) => (line.includes('-->') ? line.replace(/,/g, '.') : line))
    .join('\n');
  return `WEBVTT\n\n${body}\n`;
}

const MAX_SUB_BYTES = 5 * 1024 * 1024;

/** Returns WebVTT text for an external subtitle file (srt/vtt directly, ass/ssa through ffmpeg). */
export async function externalToVtt(cfg: Config, limiter: Limiter, file: SubtitleFile): Promise<string> {
  const abs = safeJoin(cfg.mediaDir, file.relPath);
  const st = await fs.stat(abs);
  if (st.size > MAX_SUB_BYTES) throw new Error('Subtitle file too large');
  if (file.ext === 'ass' || file.ext === 'ssa') {
    const { stdout } = await limiter.run(() =>
      run(cfg.ffmpeg, ['-nostdin', '-v', 'error', '-i', abs, '-f', 'webvtt', '-'], { timeoutMs: 60_000 }),
    );
    return stdout;
  }
  return srtToVtt(decodeSubtitle(await fs.readFile(abs), file.lang));
}

/** Extracts an embedded text subtitle stream to WebVTT, cached on disk. */
export async function embeddedToVtt(cfg: Config, limiter: Limiter, item: MediaItem, ord: number): Promise<string> {
  const out = path.join(cfg.cacheDir, 'subs', `${item.id}-${fingerprint(item.size, item.mtimeMs)}-e${ord}.vtt`);
  if (await exists(out)) return fs.readFile(out, 'utf8');
  const abs = safeJoin(cfg.mediaDir, item.relPath);
  const { stdout } = await limiter.run(() =>
    run(cfg.ffmpeg, ['-nostdin', '-v', 'error', '-i', abs, '-map', `0:s:${ord}`, '-f', 'webvtt', '-'], {
      timeoutMs: 5 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  await writeFileAtomic(out, stdout);
  return stdout;
}
