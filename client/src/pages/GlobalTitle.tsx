import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '../api';
import type { GlobalTitleDetail } from '../api-types';
import { ErrorState } from '../components/States';
import { Skel } from '../components/Skeleton';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { go } from '../router';
import { GlobalCard } from '../components/GlobalCard';
import { WatchPartyButton } from '../components/WatchPartyButton';
import { Play, Star } from '../components/Icons';
import { setMovieMetaTags, setSeriesMetaTags, resetMetaTags } from '../meta';

interface Props {
  kind: 'movie' | 'series';
  tmdbId: number;
}

export function GlobalTitle({ kind, tmdbId }: Props) {
  const { lang, t } = useI18n();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const episodesRef = useRef<HTMLDivElement>(null);
  
  const detail = useAsync(
    (s) => (kind === 'movie' ? api.discoveryMovie(tmdbId, lang, s) : api.discoveryTV(tmdbId, lang, s)),
    [kind, tmdbId, lang]
  );

  const season = useAsync(
    (s) => (kind === 'series' && selectedSeason > 0 ? api.discoverySeason(tmdbId, selectedSeason, lang, s) : Promise.resolve(null)),
    [kind, tmdbId, selectedSeason, lang]
  );

  // Update meta tags when title data loads
  useEffect(() => {
    if (detail.data) {
      if (kind === 'movie') {
        setMovieMetaTags({
          title: detail.data.title,
          overview: detail.data.overview,
          posterPath: detail.data.posterUrl?.replace(/^https:\/\/[^/]+/, '') || null,
          releaseYear: detail.data.year,
        });
      } else {
        setSeriesMetaTags({
          title: detail.data.title,
          overview: detail.data.overview,
          posterPath: detail.data.posterUrl?.replace(/^https:\/\/[^/]+/, '') || null,
          releaseYear: detail.data.year,
        });
      }
    }
    
    // Cleanup: reset to default on unmount
    return () => resetMetaTags();
  }, [detail.data, kind]);

  if (detail.error && !detail.data) {
    const nf = detail.error instanceof ApiError && detail.error.status === 404;
    return <ErrorState title={nf ? t('notFound') : t('loadError')} hint={nf ? t('notFoundHint') : t('loadErrorHint')} onRetry={detail.reload} />;
  }

  if (!detail.data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skel className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const title = detail.data;

  const handlePlay = async () => {
    if (title.localId) {
      // Local version exists - navigate to local title page
      go.title(title.localId);
    } else {
      // Global title - try to play via streaming
      if (kind === 'movie') {
        // Create synthetic media ID for global movie
        // Format: streaming-movie-{tmdbId}
        const syntheticMediaId = `streaming-movie-${tmdbId}`;
        go.watch(syntheticMediaId);
      } else {
        // For TV shows, scroll smoothly down to the episodes selector
        episodesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleEpisodePlay = async (seasonNum: number, episodeNum: number, localMediaId?: string) => {
    if (localMediaId) {
      // Local episode exists - use direct playback
      go.watch(localMediaId);
    } else {
      // Global episode - create synthetic media ID for streaming
      // Format: streaming-tv-{tmdbId}-{season}-{episode}
      const syntheticMediaId = `streaming-tv-${tmdbId}-${seasonNum}-${episodeNum}`;
      go.watch(syntheticMediaId);
    }
  };

  return (
    <div className="min-h-screen" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Hero Section */}
      <div className="relative isolate">
        {title.backdropUrl ? (
          <div className="relative h-[min(66dvh,42rem)]">
            <img
              src={title.backdropUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
            <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/50 to-transparent rtl:bg-gradient-to-l" />
          </div>
        ) : (
          <div className="h-[min(42dvh,24rem)] bg-gradient-to-br from-blood/20 via-crypt to-ink" />
        )}

        <div className="absolute inset-x-0 bottom-0 px-[var(--pad)] pb-8">
          <div className="container mx-auto max-w-5xl">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-gilt">
              {kind === 'series' ? t('series') : t('movie')}
            </p>
            <h1 className="text-balance font-display text-[clamp(2rem,5.5vw,3.6rem)] font-extrabold leading-[1.05] tracking-wide [@media(max-width:390px)]:text-[clamp(1.75rem,9vw,2.5rem)]">
              {title.title}
            </h1>
            {title.tagline && <p className="mt-2 text-base text-gilt/90 italic">{title.tagline}</p>}
            
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-dust">
              {title.year && <span>{title.year}</span>}
              {title.rating && (
                <span className="inline-flex items-center gap-1 font-semibold text-gilt">
                  <Star className="size-3.5" aria-hidden="true" />
                  {title.rating.toFixed(1)}
                </span>
              )}
              {title.runtime && <span>{title.runtime} {t('minutesUnit')}</span>}
              {title.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {title.genres.slice(0, 3).map((g) => (
                    <span key={g} className="rounded-sm border border-white/15 px-1.5 py-px text-[0.72rem] uppercase tracking-wider">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Availability */}
            <div className="mt-4 flex gap-2 flex-wrap">
              {title.availability === 'local' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-300 shadow-sm backdrop-blur-sm">
                  <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  {lang === 'ar' ? 'متاح محليًا' : 'Local'}
                </span>
              )}
              {title.availability === 'stream' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-950/70 border border-sky-500/30 px-3 py-1 text-xs font-semibold text-sky-300 shadow-sm backdrop-blur-sm">
                  <span className="size-1.5 rounded-full bg-sky-400" aria-hidden="true" />
                  {lang === 'ar' ? 'بث فوري' : 'Stream'}
                </span>
              )}
              {title.availability === 'discover' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-3 py-1 text-xs font-medium text-dust">
                  {lang === 'ar' ? 'للاستكشاف' : 'Discover'}
                </span>
              )}
            </div>

            <div className="mt-6 flex gap-3 flex-wrap items-center">
              <button
                onClick={handlePlay}
                className="group inline-flex h-11 items-center gap-2.5 rounded-lg bg-blood px-7 font-semibold text-white shadow-[0_8px_30px_-8px_rgba(220,48,68,0.7)] transition-all hover:bg-blood-hot hover:shadow-[0_10px_36px_-6px_rgba(220,48,68,0.9)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                <Play className="size-5 transition-transform group-hover:scale-110 rtl:-scale-x-100" aria-hidden="true" />
                {kind === 'series' ? (lang === 'ar' ? 'اختر حلقة' : 'Select Episode') : t('play')}
              </button>
              {kind === 'movie' && (
                <WatchPartyButton
                  mediaId={title.localId || `streaming-movie-${tmdbId}`}
                  title={title.title}
                />
              )}
              <button
                onClick={() => go.home()}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-gilt/30 bg-gilt/5 px-6 font-semibold text-gilt transition-colors hover:border-gilt/60 hover:bg-gilt/15 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                {t('back')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto max-w-6xl px-4 py-8 sm:px-8">
        {/* Overview */}
        <div className="mb-8">
          <h2 className="mb-4 font-display text-2xl font-semibold tracking-wide">{t('synopsis')}</h2>
          <p className="text-dust leading-relaxed text-base">{title.overview || t('synopsis')}</p>
        </div>

        {/* TV Show: Seasons & Episodes */}
        {kind === 'series' && title.seasons && title.seasons.length > 0 && (
          <div ref={episodesRef} id="episodes" className="scroll-mt-24">
            <h2 className="mb-4 font-display text-2xl font-semibold tracking-wide">{t('seasons')}</h2>
            
            {/* Season Selector */}
            <div className="mb-6 flex flex-wrap gap-2">
              {title.seasons.map((s) => (
                <button
                  key={s.seasonNumber}
                  onClick={() => setSelectedSeason(s.seasonNumber)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt ${
                    selectedSeason === s.seasonNumber
                      ? 'bg-blood text-white shadow-[0_4px_16px_rgba(220,48,68,0.4)] ring-1 ring-blood-hot/50'
                      : 'bg-white/[0.04] border border-white/10 text-dust hover:text-bone hover:border-gilt/30 hover:bg-white/[0.08] active:scale-95'
                  }`}
                  aria-pressed={selectedSeason === s.seasonNumber}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {/* Episodes */}
            {season.data && season.data.episodes && (
              <div className="space-y-3">
                {season.data.episodes.map((ep) => (
                  <div
                    key={ep.episodeNumber}
                    className="group flex gap-4 rounded-xl bg-white/[0.02] border border-white/[0.06] p-3.5 transition-all duration-300 hover:bg-white/[0.05] hover:border-gilt/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
                  >
                    {ep.stillUrl && (
                      <img
                        src={ep.stillUrl}
                        alt=""
                        className="h-20 w-36 flex-shrink-0 rounded-lg object-cover ring-1 ring-white/10 transition-all duration-300 group-hover:ring-gilt/40 group-hover:scale-[1.02] sm:h-24 sm:w-40"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-bone transition-colors group-hover:text-gilt truncate-safe">
                        {ep.episodeNumber}. {ep.name}
                      </h3>
                      <p className="mt-1.5 text-sm text-dust/80 line-clamp-2 leading-relaxed">{ep.overview}</p>
                      <div className="mt-2.5 flex items-center gap-3 text-xs text-dust">
                        {ep.airDate && <span>{ep.airDate}</span>}
                        {ep.runtime && <span>{ep.runtime} {t('minutesUnit')}</span>}
                        {ep.rating && (
                          <span className="inline-flex items-center gap-1 text-gilt font-mono">
                            <Star className="size-3 fill-gilt" aria-hidden="true" />
                            {ep.rating.toFixed(1)}
                          </span>
                        )}
                        {ep.availability === 'local' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-emerald-300 font-medium text-[11px]">
                            <span className="size-1 rounded-full bg-emerald-400" aria-hidden="true" />
                            {lang === 'ar' ? 'محلي' : 'Local'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleEpisodePlay(ep.seasonNumber, ep.episodeNumber, ep.localMediaId)}
                      className="flex-shrink-0 self-center inline-flex h-9 items-center gap-2 rounded-lg bg-blood px-4 sm:px-5 text-sm font-semibold transition-all duration-200 hover:bg-blood-hot hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt shadow-[0_4px_16px_rgba(220,48,68,0.3)]"
                      aria-label={`${t('play')} ${ep.name}`}
                    >
                      <Play className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                      <span className="hidden sm:inline">{t('play')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {season.loading && (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skel key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Movie: Additional Info */}
        {kind === 'movie' && (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold text-dust">{t('titleStatus')}</h3>
              <p>{title.status}</p>
            </div>
            {title.runtime && (
              <div>
                <h3 className="mb-2 font-semibold text-dust">{t('titleRuntime')}</h3>
                <p>{title.runtime} {t('minutesUnit')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
