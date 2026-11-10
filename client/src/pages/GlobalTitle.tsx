import { useState } from 'react';
import { api, ApiError } from '../api';
import type { GlobalTitleDetail } from '../api-types';
import { ErrorState } from '../components/States';
import { Skel } from '../components/Skeleton';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { go } from '../router';
import { GlobalCard } from '../components/GlobalCard';
import { WatchPartyButton } from '../components/WatchPartyButton';

interface Props {
  kind: 'movie' | 'series';
  tmdbId: number;
}

export function GlobalTitle({ kind, tmdbId }: Props) {
  const { lang, t } = useI18n();
  const [selectedSeason, setSelectedSeason] = useState(1);
  
  const detail = useAsync(
    (s) => (kind === 'movie' ? api.discoveryMovie(tmdbId, lang, s) : api.discoveryTV(tmdbId, lang, s)),
    [kind, tmdbId, lang]
  );

  const season = useAsync(
    (s) => (kind === 'series' && selectedSeason > 0 ? api.discoverySeason(tmdbId, selectedSeason, lang, s) : Promise.resolve(null)),
    [kind, tmdbId, selectedSeason, lang]
  );

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
        // For TV shows, user needs to select an episode
        alert(lang === 'ar' ? 'الرجاء اختيار حلقة' : 'Please select an episode to play');
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
      <div className="relative">
        {title.backdropUrl ? (
          <div className="relative h-[50vh] w-full">
            <img
              src={title.backdropUrl}
              alt={title.title}
              className="size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
          </div>
        ) : (
          <div className="h-[30vh] w-full bg-gradient-to-br from-gray-800 to-black" />
        )}

        <div className="absolute inset-x-0 bottom-0 px-4 pb-8 sm:px-8">
          <div className="container mx-auto max-w-6xl">
            <h1 className="font-display text-4xl font-bold tracking-wide sm:text-6xl drop-shadow-2xl">{title.title}</h1>
            {title.tagline && <p className="mt-2 text-lg text-gilt drop-shadow-lg">{title.tagline}</p>}
            
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-dust">
              {title.year && <span>{title.year}</span>}
              {title.rating && <span>★ {title.rating.toFixed(1)}</span>}
              {title.runtime && <span>{title.runtime} min</span>}
              {title.genres.length > 0 && <span>{title.genres.slice(0, 3).join(', ')}</span>}
            </div>

            {/* Availability Badge */}
            <div className="mt-4 flex gap-2 flex-wrap">
              {title.availability === 'local' && (
                <span className="rounded-full bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-1.5 text-sm font-semibold shadow-lg">🟢 LOCAL</span>
              )}
              {title.availability === 'stream' && (
                <span className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-1.5 text-sm font-semibold shadow-lg">🌐 STREAM AVAILABLE</span>
              )}
              {title.availability === 'discover' && (
                <span className="rounded-full bg-gradient-to-r from-gray-600 to-slate-600 px-4 py-1.5 text-sm font-semibold shadow-lg">DISCOVER</span>
              )}
            </div>

            <div className="mt-6 flex gap-3 flex-wrap items-center">
              <button
                onClick={handlePlay}
                className="rounded-lg bg-blood px-8 py-3 font-semibold transition-all hover:bg-blood-hot hover:scale-105 active:scale-95 shadow-lg hover:shadow-blood/40"
              >
                {kind === 'series' ? t('viewDetails') : t('play')}
              </button>
              {kind === 'movie' && (
                <WatchPartyButton
                  mediaId={title.localId || `streaming-movie-${tmdbId}`}
                  title={title.title}
                />
              )}
              <button
                onClick={() => go.home()}
                className="rounded-lg border border-gilt/30 bg-gilt/10 px-8 py-3 font-semibold transition-all hover:bg-gilt/20 hover:border-gilt/60 active:scale-95"
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
          <div>
            <h2 className="mb-4 font-display text-2xl font-semibold tracking-wide">{t('seasons')}</h2>
            
            {/* Season Selector */}
            <div className="mb-6 flex flex-wrap gap-2">
              {title.seasons.map((s) => (
                <button
                  key={s.seasonNumber}
                  onClick={() => setSelectedSeason(s.seasonNumber)}
                  className={`rounded-lg px-4 py-2 font-semibold transition-all ${
                    selectedSeason === s.seasonNumber
                      ? 'bg-gradient-to-r from-blood to-blood-hot text-white shadow-lg scale-105'
                      : 'bg-white/10 hover:bg-white/20 active:scale-95'
                  }`}
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
                    className="flex gap-4 rounded-xl bg-white/5 border border-white/5 p-4 transition-all hover:bg-gilt/10 hover:border-gilt/20 group"
                  >
                    {ep.stillUrl && (
                      <img
                        src={ep.stillUrl}
                        alt={ep.name}
                        className="h-24 w-40 flex-shrink-0 rounded-lg object-cover ring-1 ring-white/10 group-hover:ring-gilt/30 transition-all"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-bone group-hover:text-gilt transition-colors">
                        {ep.episodeNumber}. {ep.name}
                      </h3>
                      <p className="mt-1.5 text-sm text-dust line-clamp-2 leading-relaxed">{ep.overview}</p>
                      <div className="mt-2.5 flex items-center gap-3 text-xs text-dust">
                        {ep.airDate && <span>{ep.airDate}</span>}
                        {ep.runtime && <span>{ep.runtime} {t('minutesUnit')}</span>}
                        {ep.rating && <span>★ {ep.rating.toFixed(1)}</span>}
                        {ep.availability === 'local' && (
                          <span className="rounded-full bg-green-600/90 px-2.5 py-0.5 text-white font-medium">LOCAL</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleEpisodePlay(ep.seasonNumber, ep.episodeNumber, ep.localMediaId)}
                      className="flex-shrink-0 rounded-lg bg-blood px-6 py-2.5 text-sm font-semibold transition-all hover:bg-blood-hot hover:scale-105 active:scale-95 shadow-md hover:shadow-blood/40"
                    >
                      {t('play')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {season.loading && (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skel key={i} className="h-24 w-full" />
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
