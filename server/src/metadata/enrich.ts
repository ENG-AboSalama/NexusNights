import type { Config } from '../config';
import { langKey } from '../config';
import type { EpisodeMeta, Localized, LocalizedText, MediaItem, Title, TitleMeta } from '../types';
import { normalizeKey } from '../library/parse';
import { TmdbClient, type TmdbSearchHit, type TmdbSeason } from './tmdb';
import { findEpisodeOverride, locMap, type Overrides } from './overrides';

export interface EnrichDeps {
  cfg: Config;
  tmdb: TmdbClient;
  overrides: Overrides;
}

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? +d.slice(0, 4) : undefined);

/** Best TMDB hit for a guessed title: exact normalised name > contains; year match is a strong bonus. */
export function pickBest(hits: TmdbSearchHit[], name: string, year?: number): TmdbSearchHit | undefined {
  const want = normalizeKey(name);
  let best: { hit: TmdbSearchHit; score: number } | undefined;
  for (const hit of hits) {
    const names = [hit.name, hit.original_name, hit.title, hit.original_title].filter(Boolean).map((n) => normalizeKey(n!));
    let score = 0;
    if (names.includes(want)) score += 100;
    else if (names.some((n) => n && (n.includes(want) || want.includes(n)))) score += 30;
    if (score === 0) continue;
    const y = yearOf(hit.first_air_date ?? hit.release_date);
    if (year && y === year) score += 50;
    score += Math.min(10, (hit.popularity ?? 0) / 100);
    if (!best || score > best.score) best = { hit, score };
  }
  return best?.hit;
}

function mergeLoc<T extends object>(base: Localized<T>, key: string, patch: Partial<T>) {
  base[key] = { ...(base[key] ?? {}), ...patch };
}

/**
 * Builds title + episode metadata. Precedence (highest wins):
 *   data/metadata.json override  >  TMDB (per language)  >  derived from file/folder names.
 * Never throws: TMDB problems are returned as `warnings` and we fall back gracefully.
 */
export async function enrichTitle(deps: EnrichDeps, title: Title, items: MediaItem[]): Promise<string[]> {
  const { cfg, tmdb, overrides } = deps;
  const warnings: string[] = [];
  const ov = overrides.forTitle(title.folderKey);
  const langs = cfg.tmdb.languages.length ? cfg.tmdb.languages : ['en-US'];

  // 1) derived baseline
  const meta: TitleMeta = {
    source: 'derived',
    i18n: { '*': { title: title.nameGuess } },
    year: title.yearGuess,
  };
  for (const it of items) {
    it.meta = { i18n: it.titleHint ? { '*': { title: it.titleHint } } : {} };
  }

  // 2) TMDB
  let usedTmdb = false;
  if (tmdb.enabled) {
    try {
      let id = ov?.tmdbId;
      if (!id) {
        const hits = await tmdb.search(title.kind === 'series' ? 'tv' : 'movie', title.nameGuess, title.yearGuess);
        const hit = pickBest(hits, title.nameGuess, title.yearGuess) ?? (title.yearGuess ? pickBest(await tmdb.search(title.kind === 'series' ? 'tv' : 'movie', title.nameGuess), title.nameGuess) : undefined);
        id = hit?.id;
        if (!id) warnings.push(`TMDB: no confident match for "${title.nameGuess}" (add "tmdbId" in metadata.json to pin it)`);
      }
      if (id) {
        meta.tmdbId = id;
        if (title.kind === 'series') await applyTvFromTmdb(tmdb, langs, id, meta, items);
        else await applyMovieFromTmdb(tmdb, langs, id, meta, items);
        usedTmdb = true;
      }
    } catch (e) {
      warnings.push(`TMDB failed for "${title.nameGuess}": ${(e as Error).message} — using fallback metadata`);
    }
  }
  if (usedTmdb) meta.source = 'tmdb';

  // 3) metadata.json override
  if (ov) {
    const t = locMap(ov.title);
    const o = locMap(ov.overview);
    const tg = locMap(ov.tagline);
    for (const [k, v] of Object.entries(t ?? {})) mergeLoc(meta.i18n, k, { title: v });
    for (const [k, v] of Object.entries(o ?? {})) mergeLoc(meta.i18n, k, { overview: v });
    for (const [k, v] of Object.entries(tg ?? {})) mergeLoc(meta.i18n, k, { tagline: v });
    if (ov.genres) {
      const g = Array.isArray(ov.genres) ? { '*': ov.genres } : ov.genres;
      for (const [k, v] of Object.entries(g)) mergeLoc(meta.i18n, k, { genres: v });
    }
    if (ov.year) meta.year = ov.year;
    if (ov.posterFile) meta.posterFile = ov.posterFile;
    if (ov.backdropFile) meta.backdropFile = ov.backdropFile;
    if (ov.seasonNames) {
      meta.seasonNames ??= {};
      for (const [s, name] of Object.entries(ov.seasonNames)) meta.seasonNames[+s] = { ...(meta.seasonNames[+s] ?? {}), ...locMap(name)! };
    }
    meta.source = usedTmdb ? 'mixed' : 'override';

    for (const it of items) {
      if (it.season === undefined || it.episode === undefined) continue;
      const eo = findEpisodeOverride(ov.episodes, it.season, it.episode);
      if (!eo) continue;
      it.meta ??= { i18n: {} };
      for (const [k, v] of Object.entries(locMap(eo.title) ?? {})) mergeLoc(it.meta.i18n, k, { title: v });
      for (const [k, v] of Object.entries(locMap(eo.overview) ?? {})) mergeLoc(it.meta.i18n, k, { overview: v });
      if (eo.runtimeMin) it.meta.runtimeMin = eo.runtimeMin;
      if (eo.airDate) it.meta.airDate = eo.airDate;
      if (eo.stillFile) it.meta.stillFile = eo.stillFile;
    }
  }

  title.meta = meta;
  return warnings;
}

async function applyTvFromTmdb(tmdb: TmdbClient, langs: string[], id: number, meta: TitleMeta, items: MediaItem[]) {
  const details = await Promise.all(langs.map((l) => tmdb.tv(id, l)));
  const primary = details.find(Boolean);
  if (!primary) throw new Error(`TMDB tv/${id} not found`);

  meta.i18n = {};
  langs.forEach((l, i) => {
    const d = details[i];
    if (!d) return;
    mergeLoc(meta.i18n, langKey(l), {
      title: d.name,
      overview: d.overview || undefined,
      tagline: d.tagline || undefined,
      genres: d.genres?.map((g) => g.name),
    });
  });
  meta.posterPath = primary.poster_path ?? undefined;
  meta.backdropPath = primary.backdrop_path ?? undefined;
  meta.year = yearOf(primary.first_air_date) ?? meta.year;
  meta.rating = primary.vote_average ? Math.round(primary.vote_average * 10) / 10 : undefined;
  meta.status = primary.status;

  const seasons = [...new Set(items.map((i) => i.season).filter((s): s is number => s !== undefined))];
  for (const s of seasons) {
    const perLang: Array<TmdbSeason | null> = await Promise.all(
      langs.map((l) => tmdb.season(id, s, l).catch(() => null)),
    );
    langs.forEach((l, i) => {
      const name = perLang[i]?.name;
      if (name) {
        meta.seasonNames ??= {};
        meta.seasonNames[s] = { ...(meta.seasonNames[s] ?? {}), [langKey(l)]: name };
      }
    });
    for (const it of items.filter((x) => x.season === s)) {
      const meta0: EpisodeMeta = it.meta ?? { i18n: {} };
      let matched = false;
      langs.forEach((l, i) => {
        const e = perLang[i]?.episodes?.find((x) => x.episode_number === it.episode);
        if (!e) return;
        matched = true;
        mergeLoc(meta0.i18n, langKey(l), { title: e.name || undefined, overview: e.overview || undefined });
        if (i === 0 || !meta0.airDate) {
          meta0.airDate = e.air_date || meta0.airDate;
          meta0.runtimeMin = e.runtime ?? meta0.runtimeMin;
          meta0.stillPath = e.still_path ?? meta0.stillPath;
          meta0.rating = e.vote_average ? Math.round(e.vote_average * 10) / 10 : meta0.rating;
        }
      });
      if (matched) it.meta = meta0;
    }
  }
}

async function applyMovieFromTmdb(tmdb: TmdbClient, langs: string[], id: number, meta: TitleMeta, items: MediaItem[]) {
  const details = await Promise.all(langs.map((l) => tmdb.movie(id, l)));
  const primary = details.find(Boolean);
  if (!primary) throw new Error(`TMDB movie/${id} not found`);
  meta.i18n = {};
  langs.forEach((l, i) => {
    const d = details[i];
    if (!d) return;
    mergeLoc(meta.i18n, langKey(l), {
      title: d.title,
      overview: d.overview || undefined,
      tagline: d.tagline || undefined,
      genres: d.genres?.map((g) => g.name),
    });
  });
  meta.posterPath = primary.poster_path ?? undefined;
  meta.backdropPath = primary.backdrop_path ?? undefined;
  meta.year = yearOf(primary.release_date) ?? meta.year;
  meta.rating = primary.vote_average ? Math.round(primary.vote_average * 10) / 10 : undefined;
  meta.status = primary.status;
  for (const it of items) {
    it.meta = { i18n: {}, runtimeMin: primary.runtime ?? undefined, airDate: primary.release_date, rating: meta.rating };
  }
}

export type { LocalizedText };
