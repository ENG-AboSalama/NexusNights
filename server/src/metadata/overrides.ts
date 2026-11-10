import { z } from 'zod';
import type { Config } from '../config';
import { normalizeKey } from '../library/parse';
import { readJson } from '../util/fsx';
import fs from 'node:fs/promises';

const Loc = z.union([z.string(), z.record(z.string())]);
const FileName = z.string().regex(/^[\w\-. ]+\.(jpg|jpeg|png|webp)$/i, 'must be an image file name inside data/overrides/');

const EpisodeOverride = z.object({
  title: Loc.optional(),
  overview: Loc.optional(),
  runtimeMin: z.number().positive().optional(),
  airDate: z.string().optional(),
  stillFile: FileName.optional(),
});

const TitleOverride = z.object({
  tmdbId: z.number().int().positive().optional(),
  title: Loc.optional(),
  overview: Loc.optional(),
  tagline: Loc.optional(),
  year: z.number().int().optional(),
  genres: z.union([z.array(z.string()), z.record(z.array(z.string()))]).optional(),
  posterFile: FileName.optional(),
  backdropFile: FileName.optional(),
  seasonNames: z.record(Loc).optional(),
  episodes: z.record(EpisodeOverride).optional(),
});

export type TitleOverride = z.infer<typeof TitleOverride>;
export type EpisodeOverride = z.infer<typeof EpisodeOverride>;

export class Overrides {
  private map = new Map<string, TitleOverride>();
  /** Human-readable problems (invalid JSON / schema). Surfaced as scan warnings. */
  problems: string[] = [];

  static async load(cfg: Config): Promise<Overrides> {
    const o = new Overrides();
    let text: string;
    try {
      text = await fs.readFile(cfg.metadataFile, 'utf8');
    } catch {
      return o; // no file → no overrides
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      o.problems.push(`metadata.json is not valid JSON: ${(e as Error).message}`);
      return o;
    }
    if (!raw || typeof raw !== 'object') return o;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key.startsWith('$') || key.startsWith('_')) continue; // allow "$schema" / "_comment"
      const parsed = TitleOverride.safeParse(value);
      if (!parsed.success) {
        o.problems.push(`metadata.json "${key}": ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
        continue;
      }
      o.map.set(normalizeKey(key), parsed.data);
    }
    return o;
  }

  /** Lookup by folder key; "the-boys", "The Boys" and "THE.BOYS" are the same key. */
  forTitle(folderKey: string): TitleOverride | undefined {
    return this.map.get(normalizeKey(folderKey));
  }
}

/** `"X"` → { '*': 'X' };  `{en:'X', ar:'Y'}` stays. */
export function locMap(v: string | Record<string, string> | undefined): Record<string, string> | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'string' ? { '*': v } : v;
}

export const episodeKey = (season: number, episode: number) =>
  `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;

/** Accept "s2e3", "S02E03" etc. when looking up an episode override. */
export function findEpisodeOverride(
  eps: Record<string, EpisodeOverride> | undefined,
  season: number,
  episode: number,
): EpisodeOverride | undefined {
  if (!eps) return undefined;
  for (const [k, v] of Object.entries(eps)) {
    const m = k.toLowerCase().match(/^s(\d{1,2})e(\d{1,3})$/);
    if (m && +m[1] === season && +m[2] === episode) return v;
  }
  return undefined;
}
