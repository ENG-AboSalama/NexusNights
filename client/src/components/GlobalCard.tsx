import type { GlobalTitleCard } from '../api-types';
import { go } from '../router';
import { Star } from './Icons';
import { useI18n } from '../i18n';

interface Props {
  card: GlobalTitleCard;
  progress?: number;
}

const ring = 'ring-1 ring-white/8 transition-all duration-500 ease-[var(--ease-out-expo)] group-hover/card:ring-blood-hot/60 group-hover/card:shadow-[0_0_0_1px_rgba(220,48,68,0.6),0_24px_48px_-12px_rgba(0,0,0,0.95),0_0_32px_-8px_rgba(220,48,68,0.3)] group-hover/card:-translate-y-2 group-focus-visible/card:ring-gilt';

export function GlobalCard({ card, progress }: Props) {
  const { lang } = useI18n();
  const handleClick = () => {
    if (card.localId) {
      go.title(card.localId);
    } else {
      // Navigate to global title detail page
      go.globalTitle(card.kind, card.tmdbId);
    }
  };

  const availabilityBadge = () => {
    if (card.availability === 'local') {
      return (
        <span className="absolute end-2 top-2 z-10 rounded-sm bg-emerald-600/90 px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wider text-white shadow-sm backdrop-blur-sm">
          LOCAL
        </span>
      );
    }
    if (card.availability === 'stream') {
      return (
        <span className="absolute end-2 top-2 z-10 rounded-sm bg-sky-600/90 px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wider text-white shadow-sm backdrop-blur-sm">
          STREAM
        </span>
      );
    }
    return null;
  };

  const cardLabel = `${card.title}${card.year ? ` (${card.year})` : ''}${card.rating ? ` - ${card.rating.toFixed(1)} stars` : ''}`;

  return (
    <button
      onClick={handleClick}
      className="group/card relative block w-[var(--poster-w)] shrink-0 snap-start text-start outline-offset-4"
      aria-label={cardLabel}
    >
      <div className={`relative aspect-[2/3] overflow-hidden rounded-sm bg-crypt ${ring}`}>
        {card.posterUrl ? (
          <img
            src={card.posterUrl}
            alt=""
            className="size-full object-cover transition-transform duration-700 group-hover/card:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex size-full flex-col justify-between bg-gradient-to-br from-blood/20 via-crypt to-ink p-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.3em] text-blood-hot">
              {card.kind === 'series' ? 'SERIES' : 'MOVIE'}
            </span>
            <span className="text-balance font-display text-sm font-bold leading-tight">{card.title}</span>
          </div>
        )}
        
        {availabilityBadge()}
        
        {progress !== undefined && progress > 0.05 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-label={`${Math.round(progress * 100)}% ${lang === 'ar' ? 'مكتمل' : 'complete'}`}>
            <div className="h-full bg-blood-hot shadow-[0_0_8px_2px_rgba(220,48,68,0.6)]" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
        
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black via-black/30 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
          <div className="truncate-safe w-full">
            <p className="line-clamp-2 text-xs font-bold leading-snug">{card.title}</p>
            <div className="mt-1 flex items-center gap-2 text-[0.7rem] text-dust">
              {card.year && <span>{card.year}</span>}
              {card.rating ? <span className="font-semibold text-gilt inline-flex items-center gap-0.5"><Star className="size-2.5" aria-hidden="true" /> {card.rating.toFixed(1)}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
