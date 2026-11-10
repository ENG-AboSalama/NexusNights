import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Chat, Smile, Users } from '../components/Icons';
import { useI18n } from '../i18n';
import { ControlButton } from '../player/Menu';
import { ChatPanel, ReactionLayer, ReactionTray } from './ChatPanel';
import { PeoplePanel } from './PeoplePanel';
import { useRoom } from './RoomContext';
import { Toasts } from './Toasts';

export type Panel = null | 'chat' | 'people' | 'react';

const Badge = ({ n }: { n: number }) => n > 0 ? <span className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-blood-hot text-[0.6rem] font-bold">{n > 9 ? '9+' : n}</span> : null;

/** Buttons that live in the player's control bar. */
export function RoomButtons({ panel, setPanel }: { panel: Panel; setPanel: (p: Panel) => void }) {
  const { t } = useI18n();
  const r = useRoom();
  const toggle = (p: Exclude<Panel, null>) => setPanel(panel === p ? null : p);
  const pending = r.isHost ? r.room?.pending.length ?? 0 : 0;
  return (
    <>
      <div className="relative"><ControlButton label={t('reactions')} active={panel === 'react'} onClick={() => toggle('react')}><Smile className="size-6" /></ControlButton></div>
      <div className="relative"><ControlButton label={t('chat')} active={panel === 'chat'} onClick={() => toggle('chat')}><Chat className="size-6" /></ControlButton><Badge n={r.unread} /></div>
      <div className="relative"><ControlButton label={t('people')} active={panel === 'people'} onClick={() => toggle('people')}><Users className="size-6" /></ControlButton><Badge n={pending || 0} /></div>
    </>
  );
}

/** Newest message from someone else, shown briefly while the chat panel is closed. */
function ChatToast({ hidden }: { hidden: boolean }) {
  const r = useRoom();
  const last = r.chat[r.chat.length - 1];
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!last || last.userId === r.me?.id) return;
    setShown(last.id);
    const id = window.setTimeout(() => setShown((s) => (s === last.id ? null : s)), 5000);
    return () => window.clearTimeout(id);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (hidden || !last || shown !== last.id) return null;
  return (
    <div className="pointer-events-none absolute bottom-28 start-[max(1rem,2.5cqw)] z-[26] flex max-w-[min(24rem,70cqw)] animate-rise items-start gap-2 rounded-2xl border border-white/10 bg-coal/90 px-3 py-2 shadow-xl backdrop-blur-md">
      <Avatar user={{ id: last.userId, name: last.name, avatar: last.avatar }} size={24} />
      <div className="min-w-0 text-sm"><p className="truncate text-xs font-semibold text-gilt">{last.name}</p><p dir="auto" className="line-clamp-2 break-words">{last.text}</p></div>
    </div>
  );
}

/** Everything rendered INSIDE the player root, so it also works in fullscreen. */
export function RoomOverlay({ panel, setPanel, gesture, onGesture }: { panel: Panel; setPanel: (p: Panel) => void; gesture: boolean; onGesture: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <ReactionLayer />
      <ChatToast hidden={panel === 'chat'} />
      <Toasts inPlayer />
      {panel === 'chat' && <ChatPanel onClose={() => setPanel(null)} className="absolute bottom-24 end-3 top-16 z-30 w-[min(22rem,88cqw)]" />}
      {panel === 'people' && <PeoplePanel onClose={() => setPanel(null)} className="absolute bottom-24 end-3 z-30 max-h-[calc(100cqh-8rem)] w-[min(22rem,88cqw)]" />}
      {panel === 'react' && <ReactionTray className="absolute bottom-24 end-3 z-30" />}
      {gesture && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <button onClick={onGesture} className="rounded-full bg-blood px-8 py-4 font-display text-lg font-semibold tracking-wide shadow-[0_10px_40px_-8px_rgba(220,48,68,0.8)] transition hover:bg-blood-hot active:scale-95">{t('joinPlayback')}</button>
        </div>
      )}
    </>
  );
}
