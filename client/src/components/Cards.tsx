import { memo } from 'react';
import { u } from '../api';
import { fmtRuntime } from '../format';
import { useI18n } from '../i18n';
import { hrefs } from '../router';
import type { EpisodeSummary, TitleSummary } from '../api-types';
import { Play } from './Icons';

const ring =
  'ring-1 ring-white/8 transition-all duration-300 ease-[var(--ease-out-expo)] group-hover/card:ring-white/20 group-hover/card:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.9)] group-hover/card:-translate-y-1.5 group-focus-visible/card:ring-gilt';

/** Portrait poster; falls back to a typographic card when there is no artwork. */
export const TitleCard = memo(function TitleCard({ title }: { title: TitleSummary }) {
  const { t } = useI18n();
  return (
    <a href={hrefs.title(title.id)} className="group/card block w-[var(--poster-w)] shrink-0 snap-start outline-offset-4 focus-visible:outline-none" aria-label={title.title}>
      <div className={`relative aspect-[2/3] overflow-hidden rounded-md bg-crypt ${ring}`}>
        {title.posterUrl ? (
          <img src={u(title.posterUrl)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/card:scale-[1.03]" />
        ) : (
          <div className="flex size-full flex-col justify-between bg-gradient-to-br from-blood/20 via-crypt to-ink p-4">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.3em] text-blood-hot">{title.kind === 'series' ? t('series') : t('movie')}</span>
            <span className="text-balance font-display text-lg font-bold leading-tight">{title.title}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/95 via-black/40 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
          <span className="line-clamp-2 text-sm font-bold leading-snug truncate-safe text-bone">{title.title}</span>
        </div>
      </div>
    </a>
  );
});

interface EpProps {
  ep: EpisodeSummary;
  /** Big outlined numeral (the episode number) like a "Top 10" card. */
  numeral?: boolean;
  /** 0..1 watch progress */
  progress?: number;
  showTitleName?: boolean;
}

export const EpisodeCard = memo(function EpisodeCard({ ep, numeral, progress, showTitleName }: EpProps) {
  const { t, num, lang } = useI18n();
  const runtime = fmtRuntime(ep.runtimeSec, t);
  const label = ep.season !== null && ep.episode !== null && ep.kind === 'series' ? `${t('season', { n: ep.season })} · ${t('episodeShort', { n: ep.episode })}` : null;
  const cardLabel = `${ep.title}${label ? ` - ${label}` : ''}${runtime ? ` - ${runtime}` : ''}`;
  
  return (
    <a href={hrefs.watch(ep.id)} className="group/card block w-[var(--card-w)] shrink-0 snap-start outline-offset-4 focus-visible:outline-none" aria-label={cardLabel}>
      <div className={`relative aspect-video overflow-hidden rounded-md bg-crypt ${ring}`}>
        {ep.stillUrl ? (
          <img src={u(ep.stillUrl)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/card:scale-[1.04]" />
        ) : (
          <div className="size-full bg-gradient-to-br from-blood/15 via-crypt to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        {numeral && ep.episode !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-3 start-2 select-none font-display text-[clamp(3.2rem,9vw,5.2rem)] font-extrabold leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(242,235,227,0.85)] transition-[-webkit-text-stroke-color] group-hover/card:[-webkit-text-stroke-color:var(--color-gilt)]"
          >
            {num(ep.episode)}
          </span>
        )}
        <span className="absolute end-3 top-3 flex size-10 items-center justify-center rounded-full bg-blood/90 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover/card:opacity-100 group-hover/card:scale-110 shadow-lg" aria-hidden="true">
          <Play className="size-4 rtl:-scale-x-100" />
        </span>
        {!ep.playable && <span className="absolute start-3 top-3 rounded-full border border-dust/30 bg-ink/80 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-dust backdrop-blur-sm">{t('unplayable')}</span>}
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-label={`${Math.round(progress * 100)}% ${lang === 'ar' ? 'مكتمل' : 'complete'}`}>
            <div className="h-full bg-blood-hot shadow-[0_0_8px_2px_rgba(220,48,68,0.6)]" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p dir="auto" className="line-clamp-1 text-[0.92rem] font-semibold truncate-safe text-bone">{ep.title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-dust/80 truncate-safe">
          {[showTitleName ? ep.titleName : null, label, runtime].filter(Boolean).join(' · ')}
        </p>
      </div>
    </a>
  );
});
