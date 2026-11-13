import { u } from '../api';
import { fmtCount, fmtRuntime } from '../format';
import { useI18n } from '../i18n';
import type { TitleSummary } from '../api-types';
import { Info, Play, Star } from './Icons';

interface Props {
  hero: TitleSummary;
  /** Used when TMDB has no backdrop (e.g. no API key): a generated still from the library. */
  fallbackImage?: string | null;
  resumable?: boolean;
  onPlay: () => void;
  onInfo: () => void;
}

export function Hero({ hero, fallbackImage, resumable, onPlay, onInfo }: Props) {
  const { t, num } = useI18n();
  const img = hero.backdropUrl ?? fallbackImage ?? null;
  const meta: string[] = [];
  if (hero.year) meta.push(num(hero.year).replace(/[,٬]/g, ''));
  if (hero.kind === 'series') {
    if (hero.seasonCount) meta.push(fmtCount(hero.seasonCount, 'seasonCount1', 'seasonsCount', t));
    else meta.push(fmtCount(hero.episodeCount, 'episodeCount1', 'episodesCount', t));
  } else {
    const r = fmtRuntime(hero.runtimeSec, t);
    if (r) meta.push(r);
  }

  // Stable per-title visual personality — derived from title characters
  const titleHash = hero.title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  type TitleStyle = 'cinzel' | 'wide' | 'tight' | 'editorial';
  const styles: TitleStyle[] = ['cinzel', 'wide', 'tight', 'editorial'];
  const titleStyle = styles[titleHash % 4];

  const titleClass: Record<TitleStyle, string> = {
    // Uppercase Cinzel — "WEDNESDAY" / classic poster feel
    cinzel:
      'font-display uppercase tracking-[0.06em] text-[clamp(1.9rem,6vw,4.8rem)] font-bold leading-[1.0]',
    // Extra wide tracked — thriller / action
    wide:
      'font-display uppercase tracking-[0.12em] text-[clamp(1.6rem,5.2vw,4rem)] font-extrabold leading-[1.1]',
    // Tight condensed — drama / intense
    tight:
      'font-display uppercase tracking-[-0.01em] text-[clamp(2.2rem,7.5vw,6rem)] font-extrabold leading-[0.95]',
    // Sentence-case italic editorial — romance / documentary
    editorial:
      'font-display italic tracking-[0.02em] text-[clamp(1.9rem,6.2vw,5rem)] font-semibold leading-[1.05]',
  };

  return (
    <section className="relative isolate h-[min(80dvh,48rem)] min-h-[min(100dvh,26rem)] w-full overflow-hidden">
      {img ? (
        <img key={img} src={u(img)} alt="" className="absolute inset-0 -z-20 size-full origin-[70%_40%] object-cover motion-safe:animate-drift" />
      ) : (
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_30%,#2a0d14_0%,#150c0f_55%,#0a0708_100%)]" />
      )}
      {/* cinematic grading — toned down from before */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/95 via-ink/55 to-ink/10 rtl:bg-gradient-to-l" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-transparent to-black/35" />

      <div className="absolute inset-x-0 bottom-[max(10%,4.75rem)] px-[var(--pad)] sm:bottom-[max(14%,6.75rem)]">
        <div className="max-w-[min(38rem,92%)]">
          {hero.tagline ? (
            <p className="mb-3 animate-rise text-[0.72rem] font-medium uppercase tracking-[0.35em] text-gilt/90 [animation-delay:80ms]">{hero.tagline}</p>
          ) : (
            <p className="mb-3 animate-rise text-[0.72rem] font-medium uppercase tracking-[0.35em] text-gilt/90 [animation-delay:80ms]">
              {hero.kind === 'series' ? t('series') : t('movie')}
            </p>
          )}

          {/* Title — personality-driven per movie */}
          <h1
            dir="auto"
            className={`animate-rise text-bone [animation-delay:160ms] [text-shadow:0_2px_16px_rgba(0,0,0,0.95)] [@media(max-width:390px)]:!text-[clamp(1.6rem,9vw,2.5rem)] ${titleClass[titleStyle]}`}
          >
            {hero.title}
          </h1>

          <div className="mt-4 flex animate-rise flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dust [animation-delay:260ms]">
            {hero.rating ? (
              <span className="inline-flex items-center gap-1 font-semibold text-gilt"><Star className="size-3.5" />{hero.rating.toFixed(1)}</span>
            ) : null}
            {meta.map((m, i) => <span key={i} className="after:ms-3 after:text-ash after:content-['•'] last:after:content-none">{m}</span>)}
            {hero.genres.slice(0, 3).map((g) => <span key={g} className="rounded-sm border border-white/15 px-1.5 py-px text-[0.72rem] uppercase tracking-wider">{g}</span>)}
          </div>

          {hero.overview && (
            <p dir="auto" className="mt-4 line-clamp-3 max-w-prose animate-rise [@media(max-height:560px)]:hidden text-[0.95rem] leading-relaxed text-bone/75 [animation-delay:340ms] sm:text-base">{hero.overview}</p>
          )}

          <div className="mt-7 flex animate-rise flex-wrap gap-3 [animation-delay:440ms]">
            <button
              onClick={onPlay}
              className="group relative inline-flex h-11 items-center gap-2.5 overflow-hidden rounded-md bg-blood px-7 text-base font-semibold tracking-wide text-white shadow-[0_6px_20px_-6px_rgba(220,48,68,0.55)] transition-all duration-300 hover:bg-blood-hot hover:shadow-[0_8px_28px_-4px_rgba(220,48,68,0.75)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 focus-visible:ring-offset-ink before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700"
            >
              <Play className="relative z-10 size-5 transition-transform duration-300 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
              <span className="relative z-10">{resumable ? t('resume') : t('play')}</span>
            </button>
            <button
              onClick={onInfo}
              className="group inline-flex h-11 items-center gap-2.5 rounded-md border border-white/15 bg-white/[0.06] px-6 text-base font-semibold text-bone backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-white/[0.12] hover:text-gilt active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              <Info className="size-5 transition-transform duration-200 group-hover:rotate-12" aria-hidden="true" />
              {t('moreInfo')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
