import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import type { EpisodeSummary, TitleSummary } from '../api-types';
import { Cards } from '../components/CardsExports';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { HeroSkeleton, RowSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/States';
import { DiscordActivityBanner } from '../components/DiscordActivityBanner';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { allProgress, continueIds, getProgress, progressVersion, subscribeProgress } from '../progress';
import { go } from '../router';

export function Home() {
  const { lang, t } = useI18n();
  const home = useAsync((s) => api.home(lang, s), [lang]);
  const pv = useSyncExternalStore(subscribeProgress, progressVersion); // re-render when server progress arrives
  const ids = useMemo(() => continueIds(), [pv]);
  const cont = useAsync((s) => api.batch(ids, lang, s), [lang, ids.join(',')]);
  const progress = useMemo(() => allProgress(), [pv]);

  const empty = !!home.data && !home.data.hero && home.data.rows.length === 0;
  // While the library is empty/scanning, keep checking so the page fills in by itself.
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
  if (empty) return <ErrorState title={t('emptyTitle')} hint={t('emptyHint')} />;

  const { hero, rows } = home.data;
  const contItems = cont.data?.items ?? [];
  const episodesRow = rows.find((r) => r.key === 'episodes');
  const fallbackStill = (episodesRow?.items as EpisodeSummary[] | undefined)?.find((e) => e.stillUrl)?.stillUrl ?? null;
  const resumeId = hero ? contItems.find((i) => i.titleId === hero.id)?.id : undefined;

  const play = () => {
    const id = resumeId ?? hero?.firstMediaId;
    if (id) go.watch(id);
  };

  return (
    <div className="pb-4">
      {hero && <Hero hero={hero} fallbackImage={fallbackStill} resumable={!!resumeId} onPlay={play} onInfo={() => go.title(hero.id)} />}
      <div className="relative z-10 -mt-14 space-y-1 sm:-mt-20">
        {contItems.length > 0 && (
          <Row title={t('continueWatching')}>
            {contItems.map((e) => {
              const p = getProgress(e.id);
              return <Cards.Episode key={e.id} ep={e} showTitleName progress={p && p.d > 0 ? p.t / p.d : undefined} />;
            })}
          </Row>
        )}
        {rows.map((r) =>
          r.key === 'episodes' ? (
            <Row key={r.key} title={t('episodes')}>
              {(r.items as EpisodeSummary[]).map((e) => <Cards.Episode key={e.id} ep={e} numeral showTitleName={e.kind === 'movie' || !e.season} progress={progress[e.id] ? progress[e.id].t / progress[e.id].d : undefined} />)}
            </Row>
          ) : r.key === 'recently-added' ? (
            <Row key={r.key} title={t('recentlyAdded')}>
              {(r.items as TitleSummary[]).map((ti) => <Cards.Title key={ti.id} title={ti} />)}
            </Row>
          ) : null,
        )}
      </div>
      {/* Discord Activity Banner — bottom of page */}
      <div className="px-[var(--pad)] pb-16 pt-6">
        <DiscordActivityBanner />
      </div>
    </div>
  );
}
