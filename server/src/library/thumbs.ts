import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { MediaItem, SpriteInfo } from '../types';
import { run } from '../util/run';
import { Limiter } from '../util/limiter';
import { fingerprint, safeJoin } from '../util/fsx';

export const thumbPath = (cfg: Config, id: string) => path.join(cfg.cacheDir, 'thumbs', `${id}.jpg`);
export const spritePath = (cfg: Config, id: string) => path.join(cfg.cacheDir, 'sprites', `${id}.jpg`);

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function ffmpegToFile(cfg: Config, limiter: Limiter, args: string[], out: string, timeoutMs: number) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  const tmp = out.replace(/\.jpg$/, `.${process.pid}.tmp.jpg`);
  try {
    await limiter.run(() => run(cfg.ffmpeg, ['-nostdin', '-v', 'error', '-y', ...args, tmp], { timeoutMs }));
    await fs.rename(tmp, out);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/** One 640px-wide frame at ~10% of the duration. */
export async function generateThumb(cfg: Config, limiter: Limiter, item: MediaItem): Promise<void> {
  const p = item.probe;
  if (!p?.video) throw new Error('no video stream');
  const abs = safeJoin(cfg.mediaDir, item.relPath);
  const t = Math.max(0, p.durationSec * 0.1);
  await ffmpegToFile(
    cfg,
    limiter,
    ['-ss', t.toFixed(2), '-i', abs, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4'],
    thumbPath(cfg, item.id),
    60_000,
  );
}

/**
 * A single tiled JPEG (max 10 columns × 10 rows) for seek-bar hover previews.
 * Frame i is the picture at time i × intervalSec. Only keyframes are decoded, so a 45-minute
 * episode takes seconds, not minutes.
 */
export async function generateSprite(cfg: Config, limiter: Limiter, item: MediaItem): Promise<SpriteInfo> {
  const p = item.probe;
  if (!p?.video || !p.video.width || !p.video.height) throw new Error('no video stream');
  const abs = safeJoin(cfg.mediaDir, item.relPath);
  const dur = Math.max(1, p.durationSec);
  const intervalSec = Math.max(2, Math.ceil(dur / 100));
  const count = Math.max(1, Math.min(100, Math.floor(dur / intervalSec)));
  const cols = Math.min(10, count);
  const rows = Math.ceil(count / cols);
  const tileW = 160;
  const tileH = even((tileW * p.video.height) / p.video.width);

  await ffmpegToFile(
    cfg,
    limiter,
    [
      '-skip_frame', 'nokey', '-i', abs, '-an', '-sn',
      '-vf', `fps=1/${intervalSec},scale=${tileW}:${tileH},tile=${cols}x${rows}`,
      '-frames:v', '1', '-q:v', '5',
    ],
    spritePath(cfg, item.id),
    10 * 60_000,
  );
  return { cols, rows, tileW, tileH, intervalSec, count };
}

export const assetVersion = (item: MediaItem) => fingerprint(item.size, item.mtimeMs);
