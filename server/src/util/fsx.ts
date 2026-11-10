import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const shortId = (s: string, len = 12): string =>
  crypto.createHash('sha1').update(s).digest('hex').slice(0, len);

export const ID_RE = /^[a-f0-9]{12}$/;

export const toPosix = (p: string): string => p.split(path.sep).join('/');

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

/** Resolves a POSIX-style relative path under `root`; throws if it would escape. */
export function safeJoin(root: string, rel: string): string {
  const abs = path.resolve(root, ...rel.split('/'));
  if (!isInside(root, abs)) throw new Error('Path escapes root');
  return abs;
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Write-then-rename so readers never see a half-written file. */
export async function writeFileAtomic(file: string, data: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export const writeJsonAtomic = (file: string, data: unknown) =>
  writeFileAtomic(file, JSON.stringify(data));

export const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

export const fingerprint = (size: number, mtimeMs: number): string =>
  size.toString(36) + Math.floor(mtimeMs).toString(36);
