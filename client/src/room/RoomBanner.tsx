import { api } from '../api';
import { Play } from '../components/Icons';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { go } from '../router';
import { useRoom } from './RoomContext';

/** Shown while browsing: the room is watching something → jump back in. */
export function RoomBanner() {
  const { lang, t } = useI18n();
  const room = useRoom();
  const mediaId = room.state?.mediaId ?? null;
  const media = useAsync((s) => (mediaId ? api.media(mediaId, lang, s) : Promise.resolve(null)), [mediaId, lang]);
  if (!room.active || room.connection !== 'connected' || !mediaId || !media.data) return null;
  const m = media.data;
  const label = m.kind === 'series' && m.season !== null ? `${m.titleName} · ${t('season', { n: m.season })} ${t('episodeShort', { n: m.episode ?? 0 })}` : m.titleName;
  return (
    <div className="fixed inset-x-0 top-14 z-30 flex justify-center px-3 sm:top-16">
      <button
        onClick={() => {
          window.location.hash = room.roomId ? `#/watch/${mediaId}?room=${room.roomId}` : `#/watch/${mediaId}`;
        }}
        className="group mt-1 flex max-w-full animate-rise items-center gap-3 rounded-full border border-gilt/30 bg-coal/95 py-1.5 pe-2 ps-4 text-sm shadow-xl backdrop-blur-md transition hover:border-gilt/70"
      >
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-blood-hot" />
        <span dir="auto" className="truncate">{t('nowWatching', { title: label })}</span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-blood px-3 py-1 font-semibold transition group-hover:bg-blood-hot"><Play className="size-3.5 rtl:-scale-x-100" />{t('rejoin')}</span>
      </button>
    </div>
  );
}
