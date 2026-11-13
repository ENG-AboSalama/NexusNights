import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import { EpisodeCard } from '../components/Cards';
import { GlobalCard } from '../components/GlobalCard';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { HeroSkeleton, RowSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/States';
import { DiscordActivityBanner } from '../components/DiscordActivityBanner';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { allProgress, continueIds, getProgress, progressVersion, subscribeProgress } from '../progress';
import { go } from '../router';

export function GlobalHome() {
  const { lang, t } = useI18n();
  const home = useAsync((s) => api.discoveryHome(lang, s), [lang]);
  const pv = useSyncExternalStore(subscribeProgress, progressVersion);
  const ids = useMemo(() => continueIds(), [pv]);
  const cont = useAsync((s) => api.batch(ids, lang, s), [lang, ids.join(',')]);
  const progress = useMemo(() => allProgress(), [pv]);

  const empty = !!home.data && !home.data.hero && home.data.sections.length === 0;
  
  // While the library is empty/scanning, keep checking
  useEffect(() => {
    if (!empty) return;
    const id = setInterval(() => home.reload(), 4000);
    return () => clearInterval(id);
  }, [empty, home.reload]);

  if (home.error && !home.data) {
    const nf = home.error instanceof ApiError && home.error.status === 404;
    return <ErrorState title={nf ? t('notFound') : t('loadError')} hint={t('loadErrorHint')} onRetry={home.reload} />;
  }

  if (!home.data) {
    return (
      <div>
        <HeroSkeleton />
        <div className="-mt-10 space-y-6"><RowSkeleton /><RowSkeleton /></div>
      </div>
    );
  }

  if (empty) return <ErrorState title={t('emptyTitle')} hint={t('emptyHint')} onRetry={home.reload} />;

  const { hero, sections } = home.data;
  const contItems = cont.data?.items ?? [];

  const play = () => {
    if (!hero) return;
    
    // If hero is local, use existing flow
    if (hero.localId) {
      const resumeId = contItems.find((i) => i.titleId === hero.localId)?.id;
      const id = resumeId ?? hero.id;
      if (id) go.watch(id);
    } else {
      // Global title - navigate to its detail page
      go.globalTitle(hero.kind, hero.tmdbId);
    }
  };

  const onInfo = () => {
    if (!hero) return;
    if (hero.localId) {
      go.title(hero.localId);
    } else {
      go.globalTitle(hero.kind, hero.tmdbId);
    }
  };

  return (
    <main className="pb-16">
      {hero && (
        <Hero
          hero={{
            id: hero.id,
            kind: hero.kind,
            title: hero.title,
            year: hero.year,
            overview: hero.overview,
            tagline: null,
            genres: [],
            rating: hero.rating,
            posterUrl: hero.posterUrl,
            backdropUrl: hero.backdropUrl,
            seasonCount: 0,
            episodeCount: 0,
            addedAt: 0,
            mediaId: hero.localId || null,
            firstMediaId: hero.localId || null,
            runtimeSec: null,
          }}
          fallbackImage={null}
          resumable={false}
          onPlay={play}
          onInfo={onInfo}
        />
      )}
      
      <div className="relative z-10 space-y-8">
        {/* Continue Watching */}
        {contItems.length > 0 && (
          <Row title={t('continueWatching')}>
            {contItems.map((e) => {
              const p = getProgress(e.id);
              return <EpisodeCard key={e.id} ep={e} showTitleName progress={p && p.d > 0 ? p.t / p.d : undefined} />;
            })}
          </Row>
        )}

        {/* Global Discovery Sections */}
        {sections.map((section, sectionIdx) => {
          const isRanked =
            sectionIdx === 0 ||
            section.key.includes('trending') ||
            section.key.includes('popular');
          return (
            <Row key={section.key} title={section.title}>
              {section.items.map((card, idx) => (
                <GlobalCard
                  key={card.id}
                  card={card}
                  rank={isRanked ? idx + 1 : undefined}
                />
              ))}
            </Row>
          );
        })}
      </div>

      {/* Discord Activity Banner — bottom of page, after all content */}
      <div className="px-[var(--pad)] pb-16 pt-8">
        <DiscordActivityBanner />
      </div>
    </main>
  );
}
