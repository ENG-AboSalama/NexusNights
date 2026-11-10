import type { Localized, MediaItem, Title } from '../types';
import type { LibraryService } from '../library/service';
import { assetVersion } from '../library/thumbs';
import { probeErrorCode } from '../library/playback-error';
import { langLabel } from '../util/lang';
import { shortId } from '../util/fsx';
import { tmdbArtworkUrl } from './images';
import type {
  AudioTrackInfo, EpisodeDetail, EpisodeSummary, HomeResponse, ScanStatusPublic,
  SeasonBlock, SubtitleTrackInfo, TitleDetail, TitleSummary,
} from './api-types';

/** Field-level fallback: requested language → en → language-neutral → anything. */
function field<T extends object, K extends keyof T>(loc: Localized<T> | undefined, lang: string, key: K): T[K] | undefined {
  if (!loc) return undefined;
  for (const l of [lang, 'en', '*', ...Object.keys(loc)]) {
    const v = loc[l]?.[key];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v !== '')) return v;
  }
  return undefined;
}

const EP_LABEL: Record<string, (n: number) => string> = {
  en: (n) => `Episode ${n}`,
  ar: (n) => `الحلقة ${n}`,
};

export class Presenter {
  constructor(private svc: LibraryService) {}

  private get store() {
    return this.svc.store;
  }

  private ver(s: string | undefined) {
    return s ? shortId(s, 6) : '';
  }

  titleName(t: Title, lang: string): string {
    return field(t.meta?.i18n, lang, 'title') ?? t.nameGuess;
  }

  posterUrl(t: Title): string | null {
    const m = t.meta;
    if (m?.posterFile || m?.posterPath) return `/api/images/poster/${t.id}?v=${this.ver(m.posterFile ?? m.posterPath)}`;
    return null;
  }
  backdropUrl(t: Title): string | null {
    const m = t.meta;
    if (m?.backdropFile || m?.backdropPath) return `/api/images/backdrop/${t.id}?v=${this.ver(m.backdropFile ?? m.backdropPath)}`;
    return null;
  }

  summary(t: Title, lang: string): TitleSummary {
    const items = this.store.itemsOf(t.id);
    const seasons = new Set(items.map((i) => i.season).filter((s) => s !== undefined && s > 0));
    const movieItem = t.kind === 'movie' ? items[0] : undefined;
    return {
      id: t.id,
      kind: t.kind,
      title: this.titleName(t, lang),
      year: t.meta?.year ?? t.yearGuess ?? null,
      overview: field(t.meta?.i18n, lang, 'overview') ?? '',
      tagline: field(t.meta?.i18n, lang, 'tagline') ?? null,
      genres: field(t.meta?.i18n, lang, 'genres') ?? [],
      rating: t.meta?.rating ?? null,
      posterUrl: this.posterUrl(t),
      backdropUrl: this.backdropUrl(t),
      seasonCount: seasons.size,
      episodeCount: items.length,
      addedAt: t.addedAt,
      mediaId: movieItem?.id ?? null,
      firstMediaId: (items.find((i) => i.season !== 0) ?? items[0])?.id ?? null,
      runtimeSec: movieItem ? this.runtime(movieItem) : null,
    };
  }

  private runtime(m: MediaItem): number | null {
    if (m.probe?.durationSec) return Math.round(m.probe.durationSec);
    return m.meta?.runtimeMin ? m.meta.runtimeMin * 60 : null;
  }

  episode(m: MediaItem, lang: string): EpisodeSummary {
    const t = this.store.titles.get(m.titleId)!;
    const isMovie = t.kind === 'movie';
    const thumbUrl = m.assets.thumb ? `/api/thumbs/${m.id}.jpg?v=${assetVersion(m)}` : null;
    const hasStill = !!(m.meta?.stillFile || m.meta?.stillPath);
    const label = (EP_LABEL[lang] ?? EP_LABEL.en)(m.episode ?? 0);
    return {
      id: m.id,
      titleId: m.titleId,
      titleName: this.titleName(t, lang),
      kind: t.kind,
      season: m.season ?? null,
      episode: m.episode ?? null,
      episodeEnd: m.episodeEnd ?? null,
      title: isMovie ? this.titleName(t, lang) : field(m.meta?.i18n, lang, 'title') ?? label,
      overview: isMovie ? field(t.meta?.i18n, lang, 'overview') ?? '' : field(m.meta?.i18n, lang, 'overview') ?? '',
      airDate: m.meta?.airDate ?? null,
      runtimeSec: this.runtime(m),
      stillUrl: hasStill ? `/api/images/still/${m.id}?v=${this.ver(m.meta?.stillFile ?? m.meta?.stillPath)}` : thumbUrl,
      thumbUrl,
      playable: !!m.probe,
    };
  }

  async streamingEpisodeSummary(id: string, lang: string): Promise<EpisodeSummary | null> {
    const tmdbLang = lang === 'ar' ? 'ar-SA' : 'en-US';

    if (id.startsWith('streaming-movie-') || id.startsWith('movie-')) {
      const tmdbId = parseInt(id.replace(/^(?:streaming-)?movie-/, ''), 10);
      if (isNaN(tmdbId)) return null;

      try {
        const movie = this.svc.tmdb.enabled
          ? await this.svc.tmdb.getMovieDetail(tmdbId, tmdbLang).catch(() => this.svc.tmdb.getMovie(tmdbId))
          : null;

        const title = movie?.title || `Movie ${tmdbId}`;
        const still = tmdbArtworkUrl('still', movie?.backdrop_path);
        const thumb = tmdbArtworkUrl('poster', movie?.poster_path);

        return {
          id: id.startsWith('streaming-') ? id : `streaming-movie-${tmdbId}`,
          titleId: `movie-${tmdbId}`,
          titleName: title,
          kind: 'movie',
          season: null,
          episode: null,
          episodeEnd: null,
          title,
          overview: movie?.overview || '',
          airDate: movie?.release_date || null,
          runtimeSec: movie?.runtime ? movie.runtime * 60 : null,
          stillUrl: still || thumb,
          thumbUrl: thumb,
          playable: true,
        };
      } catch {
        return {
          id: id.startsWith('streaming-') ? id : `streaming-movie-${tmdbId}`,
          titleId: `movie-${tmdbId}`,
          titleName: `Movie ${tmdbId}`,
          kind: 'movie',
          season: null,
          episode: null,
          episodeEnd: null,
          title: `Movie ${tmdbId}`,
          overview: '',
          airDate: null,
          runtimeSec: null,
          stillUrl: null,
          thumbUrl: null,
          playable: true,
        };
      }
    }

    if (id.startsWith('streaming-tv-') || id.startsWith('tv-')) {
      let tmdbId: number;
      let season: number;
      let episode: number;

      if (id.startsWith('streaming-tv-')) {
        const parts = id.replace('streaming-tv-', '').split('-');
        tmdbId = parseInt(parts[0], 10);
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
      } else {
        const m = /^tv-(\d+)-s(\d+)e(\d+)$/.exec(id);
        if (!m) return null;
        tmdbId = parseInt(m[1], 10);
        season = parseInt(m[2], 10);
        episode = parseInt(m[3], 10);
      }

      if (isNaN(tmdbId) || isNaN(season) || isNaN(episode)) return null;

      try {
        const tv = this.svc.tmdb.enabled
          ? await this.svc.tmdb.getTvDetail(tmdbId, tmdbLang).catch(() => this.svc.tmdb.getTv(tmdbId))
          : null;
        const seasonDetail = this.svc.tmdb.enabled
          ? await this.svc.tmdb.getSeasonDetail(tmdbId, season, tmdbLang).catch(() => null)
          : null;
        const ep = seasonDetail?.episodes?.find((e) => e.episode_number === episode);

        const showName = tv?.name || `TV Show ${tmdbId}`;
        const epName = ep?.name || (lang === 'ar' ? `الحلقة ${episode}` : `Episode ${episode}`);
        const still = tmdbArtworkUrl('still', ep?.still_path ?? tv?.backdrop_path);
        const thumb = tmdbArtworkUrl('poster', tv?.poster_path);
        const episodeRunTime = (tv as any)?.episode_run_time?.[0];
        const runtime = ep?.runtime ? ep.runtime * 60 : (episodeRunTime ? episodeRunTime * 60 : null);

        return {
          id: id.startsWith('streaming-') ? id : `streaming-tv-${tmdbId}-${season}-${episode}`,
          titleId: `tv-${tmdbId}`,
          titleName: showName,
          kind: 'series',
          season,
          episode,
          episodeEnd: null,
          title: epName,
          overview: ep?.overview || tv?.overview || '',
          airDate: ep?.air_date || null,
          runtimeSec: runtime,
          stillUrl: still || thumb,
          thumbUrl: thumb,
          playable: true,
        };
      } catch {
        return {
          id: id.startsWith('streaming-') ? id : `streaming-tv-${tmdbId}-${season}-${episode}`,
          titleId: `tv-${tmdbId}`,
          titleName: `TV Show ${tmdbId}`,
          kind: 'series',
          season,
          episode,
          episodeEnd: null,
          title: lang === 'ar' ? `الحلقة ${episode}` : `Episode ${episode}`,
          overview: '',
          airDate: null,
          runtimeSec: null,
          stillUrl: null,
          thumbUrl: null,
          playable: true,
        };
      }
    }

    return null;
  }

  detail(m: MediaItem, lang: string): EpisodeDetail {
    const base = this.episode(m, lang);
    const t = this.store.titles.get(m.titleId)!;
    const siblings = this.store.itemsOf(m.titleId);
    const i = siblings.findIndex((x) => x.id === m.id);
    const audioTracks: AudioTrackInfo[] = (m.probe?.audio ?? []).map((a) => ({
      index: a.ord,
      lang: a.lang ?? null,
      label: a.label || langLabel(a.lang) || `Track ${a.ord + 1}`,
      channels: a.channels ?? null,
      default: a.default,
    }));
    const subtitles: SubtitleTrackInfo[] = [
      ...m.subtitleFiles.map<SubtitleTrackInfo>((s, idx) => ({
        id: `ext-${idx}`,
        lang: s.lang ?? null,
        label: s.label,
        source: 'external',
        forced: s.forced,
        url: `/api/subtitles/${m.id}/ext-${idx}.vtt`,
      })),
      ...(m.probe?.subs ?? [])
        .filter((s) => s.textBased)
        .map<SubtitleTrackInfo>((s) => ({
          id: `emb-${s.ord}`,
          lang: s.lang ?? null,
          label: s.label || langLabel(s.lang) || `Subtitles ${s.ord + 1}`,
          source: 'embedded',
          forced: s.forced,
          url: `/api/subtitles/${m.id}/emb-${s.ord}.vtt`,
        })),
    ];
    const sp = m.assets.sprite;
    return {
      ...base,
      width: m.probe?.video?.width ?? null,
      height: m.probe?.video?.height ?? null,
      playback: m.playback ? { mode: m.playback.mode, video: m.playback.video, audio: m.playback.audio } : null,
      playbackError: m.probe ? undefined : probeErrorCode(m.probeError),
      audioTracks,
      subtitles,
      sprite: sp ? { url: `/api/sprites/${m.id}.jpg?v=${assetVersion(m)}`, ...sp } : null,
      prevId: i > 0 ? siblings[i - 1].id : null,
      nextId: i >= 0 && i < siblings.length - 1 ? siblings[i + 1].id : null,
      tmdbId: t.meta?.tmdbId,
      tmdbType: t.kind === 'movie' ? 'movie' : 'tv',
    };
  }

  titleDetail(t: Title, lang: string): TitleDetail {
    const items = this.store.itemsOf(t.id);
    const bySeason = new Map<number, MediaItem[]>();
    if (t.kind === 'series') {
      for (const it of items) bySeason.set(it.season ?? 1, [...(bySeason.get(it.season ?? 1) ?? []), it]);
    }
    const seasons: SeasonBlock[] = [...bySeason.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([season, list]) => ({
        season,
        name: this.seasonName(t, season, lang),
        episodes: list.map((m) => this.episode(m, lang)),
      }));
    return { ...this.summary(t, lang), seasons };
  }

  private seasonName(t: Title, season: number, lang: string): string | null {
    const names = t.meta?.seasonNames?.[season];
    if (!names) return null;
    return names[lang] ?? names.en ?? names['*'] ?? Object.values(names)[0] ?? null;
  }

  home(lang: string): HomeResponse {
    const titles = [...this.store.titles.values()].sort((a, b) => b.addedAt - a.addedAt);
    const hero = titles.find((t) => this.backdropUrl(t)) ?? titles[0] ?? null;
    const rows: HomeResponse['rows'] = [];

    // "Episodes": the first episodes of the featured series (or the latest ones across the library).
    const heroItems = hero ? this.store.itemsOf(hero.id) : [];
    const epSource = hero?.kind === 'series' && heroItems.length > 1
      ? heroItems
      : titles.flatMap((t) => this.store.itemsOf(t.id));
    if (epSource.length) rows.push({ key: 'episodes', kind: 'episode', items: epSource.slice(0, 20).map((m) => this.episode(m, lang)) });

    if (titles.length) rows.push({ key: 'recently-added', kind: 'title', items: titles.slice(0, 20).map((t) => this.summary(t, lang)) });
    return { hero: hero ? this.summary(hero, lang) : null, rows };
  }

  status(): ScanStatusPublic {
    const s = this.svc.status;
    return {
      state: s.state,
      phase: s.phase,
      done: s.done,
      total: s.total,
      scannedAt: this.store.scannedAt,
      warningCount: s.warnings.length,
      titleCount: this.store.titles.size,
      mediaCount: this.store.media.size,
    };
  }
}

/** `?lang=ar` → 'ar'. Anything unexpected → 'en'. */
export function resolveLang(q: unknown): string {
  const s = typeof q === 'string' ? q.toLowerCase().split(/[-_]/)[0] : '';
  return /^[a-z]{2,3}$/.test(s) ? s : 'en';
}

/** Convert simple lang code to TMDB language format */
export function langToTmdb(lang: string): string {
  const mapping: Record<string, string> = {
    'ar': 'ar-SA',
    'en': 'en-US',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'de': 'de-DE',
    'it': 'it-IT',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN',
    'pt': 'pt-BR',
    'ru': 'ru-RU',
    'tr': 'tr-TR',
  };
  return mapping[lang] || 'en-US';
}
