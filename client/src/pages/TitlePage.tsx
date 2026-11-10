import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, u } from '../api';
import type { EpisodeSummary } from '../api-types';
import { Play, Star } from '../components/Icons';
import { Skel } from '../components/Skeleton';
import { ErrorState } from '../components/States';
import { fmtCount, fmtRuntime } from '../format';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { allProgress, isFinished } from '../progress';
import { go, hrefs } from '../router';

export function TitlePage({ id }: { id: string }) {
  const { lang, t, num } = useI18n();
  const d = useAsync((s) => api.title(id, lang, s), [id, lang]);
  const progress = useMemo(() => allProgress(), [id]);
  const [season, setSeason] = useState<number | null>(null);
  const data = d.data;

  // Default season = the one you are currently watching, else the first.
  const resumeEp = useMemo(() => {
    if (!data) return undefined;
    const all = data.seasons.flatMap((s) => s.episodes);
    const seen = all.filter((e) => progress[e.id]).sort((a, b) => progress[b.id].at - progress[a.id].at);
    const cur = seen.find((e) => !isFinished(progress[e.id]));
    if (cur) return cur;
    const last = seen[0];
    if (last) { const i = all.findIndex((e) => e.id === last.id); return all[i + 1] ?? last; }
    return undefined;
  }, [data, progress]);

  useEffect(() => { setSeason(null); window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    if (data && season === null && data.seasons.length) setSeason(resumeEp?.season ?? data.seasons[0].season);
  }, [data, season, resumeEp]);

  if (d.error && !data) {
    const nf = d.error instanceof ApiError && d.error.status === 404;
    return <ErrorState title={nf ? t('notFound') : t('loadError')} hint={nf ? t('notFoundHint') : t('loadErrorHint')} onRetry={nf ? undefined : d.reload} />;
  }
  if (!data) {
    return (
      <div className="px-[var(--pad)] pt-28"><Skel className="mb-4 h-12 w-80 max-w-full" /><Skel className="mb-8 h-24 w-full max-w-xl" />
        {Array.from({ length: 4 }, (_, i) => <Skel key={i} className="mb-3 h-24 w-full" />)}</div>
    );
  }

  const firstId = data.firstMediaId;
  const playId = resumeEp?.id ?? firstId;
  const hasProgress = !!resumeEp && !!progress[resumeEp.id];
  const cur = data.seasons.find((s) => s.season === season) ?? data.seasons[0];
  const still = data.seasons[0]?.episodes.find((e) => e.stillUrl)?.stillUrl ?? null;
  const img = data.backdropUrl ?? still;
  const meta = [
    data.year ? String(data.year) : null,
    data.kind === 'series' ? (data.seasonCount ? fmtCount(data.seasonCount, 'seasonCount1', 'seasonsCount', t) : null) : fmtRuntime(data.runtimeSec, t),
    data.kind === 'series' ? fmtCount(data.episodeCount, 'episodeCount1', 'episodesCount', t) : null,
  ].filter(Boolean);

  return (
    <div className="pb-20">
      <section className="relative isolate min-h-[min(66dvh,34rem)] overflow-hidden">
        {img ? <img src={u(img)} alt="" className="absolute inset-0 -z-20 size-full object-cover" /> : <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_20%,#3a1219,#0a0708_70%)]" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/75 to-ink/20 rtl:bg-gradient-to-l" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/20 to-ink/60" />
        <div className="flex min-h-[min(66dvh,34rem)] items-end px-[var(--pad)] pb-10 pt-28">
          <div className="max-w-[min(42rem,100%)] animate-rise">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-gilt">{data.kind === 'series' ? t('series') : t('movie')}</p>
            <h1 className="text-balance font-display text-[clamp(2rem,5.4vw,3.8rem)] font-extrabold leading-[1.05] tracking-wide">{data.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dust">
              {data.rating ? <span className="inline-flex items-center gap-1 font-semibold text-gilt"><Star className="size-3.5" />{data.rating.toFixed(1)}</span> : null}
              {meta.map((m, i) => <span key={i}>{m}</span>)}
              {data.genres.slice(0, 4).map((g) => <span key={g} className="rounded-sm border border-white/15 px-1.5 py-px text-[0.72rem] uppercase tracking-wider">{g}</span>)}
            </div>
            <p dir="auto" className="mt-4 max-w-prose leading-relaxed text-bone/85">{data.overview || t('synopsis')}</p>
            {playId && (
              <button onClick={() => go.watch(playId)} className="group mt-6 inline-flex h-11 items-center gap-2.5 rounded-md bg-blood px-7 font-semibold text-white shadow-[0_8px_30px_-8px_rgba(220,48,68,0.7)] transition-all hover:bg-blood-hot active:scale-[0.97]">
                <Play className="size-5 transition-transform group-hover:scale-110 rtl:-scale-x-100" />
                {hasProgress ? t('resume') : t('play')}
                {data.kind === 'series' && resumeEp?.season != null && <span className="text-white/75">· {t('season', { n: resumeEp.season })} {t('episodeShort', { n: resumeEp.episode ?? 0 })}</span>}
              </button>
            )}
          </div>
        </div>
      </section>

      {data.kind === 'series' && cur && (
        <section className="px-[var(--pad)] pt-4">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-white/10 pb-3">
            <h2 className="font-display text-xl font-semibold tracking-[0.12em]">{t('episodes')}</h2>
            {data.seasons.length > 1 && (
              <select
                value={cur.season}
                onChange={(e) => setSeason(Number(e.target.value))}
                aria-label="Season"
                className="rounded-md border border-white/15 bg-crypt px-3 py-2 text-sm text-bone transition-colors hover:border-gilt/60"
              >
                {data.seasons.map((s) => <option key={s.season} value={s.season}>{s.name ?? (s.season === 0 ? t('specials') : t('season', { n: s.season }))}</option>)}
              </select>
            )}
          </div>
          <ol className="divide-y divide-white/5">
            {cur.episodes.map((e, i) => <EpisodeRow key={e.id} ep={e} index={i} progress={progress[e.id]} />)}
          </ol>
        </section>
      )}
    </div>
  );
}

function EpisodeRow({ ep, index, progress }: { ep: EpisodeSummary; index: number; progress?: { t: number; d: number } }) {
  const { t, num } = useI18n();
  const rt = fmtRuntime(ep.runtimeSec, t);
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}>
      <a href={hrefs.watch(ep.id)} className="group/ep flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.04] sm:gap-5 sm:px-3">
        <span className="w-7 shrink-0 text-center font-display text-2xl font-bold text-dust transition-colors group-hover/ep:text-gilt sm:w-10 sm:text-3xl">{num(ep.episode ?? index + 1)}</span>
        <div className="relative aspect-video w-[clamp(7.5rem,24vw,13rem)] shrink-0 overflow-hidden rounded-md bg-crypt ring-1 ring-white/5">
          {ep.stillUrl && <img src={u(ep.stillUrl)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover/ep:scale-105" />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover/ep:bg-black/40 group-hover/ep:opacity-100"><Play className="size-8 rtl:-scale-x-100" /></span>
          {progress && progress.d > 0 && <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15"><div className="h-full bg-blood-hot" style={{ width: `${Math.min(100, (progress.t / progress.d) * 100)}%` }} /></div>}
          {!ep.playable && <span className="absolute start-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-dust">{t('unplayable')}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p dir="auto" className="truncate font-semibold">{ep.title}</p>
            {rt && <span className="shrink-0 text-sm text-dust">{rt}</span>}
          </div>
          {ep.overview && <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-relaxed text-dust @max-sm:hidden sm:line-clamp-3">{ep.overview}</p>}
        </div>
      </a>
    </li>
  );
}
