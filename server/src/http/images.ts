import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import { exists, shortId, writeFileAtomic } from '../util/fsx';

const SIZE = { poster: 'w500', backdrop: 'w1280', still: 'w780' } as const;
export type ArtKind = keyof typeof SIZE;
const TMDB_PATH = /^\/[\w-]+\.(jpg|jpeg|png|webp)$/i;
const MAX_BYTES = 10 * 1024 * 1024;

export function tmdbArtworkUrl(kind: ArtKind, tmdbPath: string | null | undefined): string | null {
  if (!tmdbPath || !TMDB_PATH.test(tmdbPath)) return null;
  return `/api/images/tmdb/${kind}/${encodeURIComponent(tmdbPath.slice(1))}`;
}

/**
 * Downloads TMDB artwork once and serves it from disk afterwards. The browser therefore only
 * ever talks to OUR server (→ a single Discord URL mapping), never to image.tmdb.org.
 */
export class ImageCache {
  private inflight = new Map<string, Promise<string | null>>();
  constructor(private cfg: Config) {}

  get(kind: ArtKind, tmdbPath: string): Promise<string | null> {
    if (!TMDB_PATH.test(tmdbPath)) return Promise.resolve(null); // also blocks SSRF-ish paths like "/../x"
    const ext = path.extname(tmdbPath).toLowerCase();
    const file = path.join(this.cfg.cacheDir, 'images', `${kind}-${shortId(tmdbPath, 16)}${ext}`);
    const existing = this.inflight.get(file);
    if (existing) return existing;
    const p = this.download(kind, tmdbPath, file).finally(() => this.inflight.delete(file));
    this.inflight.set(file, p);
    return p;
  }

  private async download(kind: ArtKind, tmdbPath: string, file: string): Promise<string | null> {
    if (await exists(file)) return file;
    try {
      const res = await fetch(`${this.cfg.tmdb.imageBase}/${SIZE[kind]}${tmdbPath}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES) return null;
      await writeFileAtomic(file, buf);
      return file;
    } catch {
      return null;
    }
  }
}

export async function statOrNull(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

/** Discord avatars are fetched by OUR server so the Activity iframe never needs the Discord CDN. */
export class AvatarCache {
  private inflight = new Map<string, Promise<string | null>>();
  constructor(private cfg: Config) {}

  get(userId: string, hash: string): Promise<string | null> {
    const file = path.join(this.cfg.cacheDir, 'avatars', `${userId}-${hash}.png`);
    const cur = this.inflight.get(file);
    if (cur) return cur;
    const p = (async () => {
      if (await exists(file)) return file;
      try {
        const res = await fetch(`${this.cfg.discord.cdnBase}/avatars/${userId}/${hash}.png?size=64`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > 1024 * 1024) return null;
        await writeFileAtomic(file, buf);
        return file;
      } catch {
        return null;
      }
    })().finally(() => this.inflight.delete(file));
    this.inflight.set(file, p);
    return p;
  }
}
