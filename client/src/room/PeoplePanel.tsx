import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Check, Close, Crown, Users } from '../components/Icons';
import { useI18n } from '../i18n';
import { useRoom, type ControlMode } from './RoomContext';

const MODES: { id: ControlMode; label: 'modeHost' | 'modeSelected' | 'modeEveryone' }[] = [
  { id: 'host', label: 'modeHost' },
  { id: 'selected', label: 'modeSelected' },
  { id: 'everyone', label: 'modeEveryone' },
];

/** Members, roles, control requests. Hosts get the management buttons. Used in the player and the top bar. */
export function PeoplePanel({ className = '', onClose }: { className?: string; onClose?: () => void }) {
  const { t } = useI18n();
  const r = useRoom();
  const [copied, setCopied] = useState(false);
  if (!r.room) return null;
  const pending = new Set(r.room.pending);
  const iAmPending = !!r.me && pending.has(r.me.id);

  const copyRoomLink = () => {
    const link = `${window.location.origin}/#/watch/${r.state?.mediaId || ''}?room=${r.room!.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    r.toast(t('copiedRoomLink'));
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div onClick={(e) => e.stopPropagation()} className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-coal/95 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.95)] backdrop-blur-xl animate-fade ${className}`}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h3 className="font-display text-sm font-semibold tracking-[0.18em]">{t('people')} · {r.room.members.length}</h3>
        {onClose && <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-dust transition hover:bg-white/10 hover:text-bone"><Close className="size-4" /></button>}
      </div>

      <div className="px-4 pb-2">
        <button
          onClick={copyRoomLink}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-gilt/30 bg-gilt/10 py-1.5 text-xs font-medium text-gilt transition hover:border-gilt hover:bg-gilt/20"
        >
          {copied ? <Check className="size-3.5" /> : <Users className="size-3.5" />}
          <span>{copied ? t('copied') : t('inviteFriends')}</span>
        </button>
      </div>

      {r.isHost && (
        <div className="px-4 pb-3">
          <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gilt">{t('controlMode')}</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/40 p-1">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => r.setMode(m.id)} className={`rounded-md px-1.5 py-1.5 text-[0.72rem] leading-tight transition ${r.room!.mode === m.id ? 'bg-blood text-white' : 'text-dust hover:bg-white/10'}`}>{t(m.label)}</button>
            ))}
          </div>
        </div>
      )}

      <ul className="max-h-[min(20rem,45cqh)] flex-1 overflow-y-auto px-2 pb-2">
        {r.room.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
            <Avatar user={m} size={32} />
            <div className="min-w-0 flex-1">
              <p dir="auto" className="flex items-center gap-1.5 truncate text-sm font-medium">
                {m.name}
                {m.id === r.me?.id && <span className="rounded bg-white/10 px-1 text-[0.62rem] uppercase tracking-wider text-dust">{t('youBadge')}</span>}
              </p>
              <p className="flex items-center gap-1 text-[0.7rem] text-dust">
                {m.isHost ? <><Crown className="size-3 text-gilt" />{t('hostBadge')}</> : m.canControl ? t('controllerBadge') : null}
                {m.buffering && <span className="text-gilt">·&nbsp;…</span>}
              </p>
            </div>

            {r.isHost && pending.has(m.id) && (
              <div className="flex gap-1">
                <button onClick={() => r.act('control:grant', m.id)} aria-label={t('approve')} title={t('approve')} className="rounded-md bg-blood p-1.5 transition hover:bg-blood-hot"><Check className="size-3.5" /></button>
                <button onClick={() => r.act('control:deny', m.id)} aria-label={t('deny')} title={t('deny')} className="rounded-md border border-white/15 p-1.5 transition hover:bg-white/10"><Close className="size-3.5" /></button>
              </div>
            )}
            {r.isHost && !m.isHost && !pending.has(m.id) && (
              <div className="flex gap-1">
                <button
                  onClick={() => r.act(r.room!.controllers.includes(m.id) ? 'control:revoke' : 'control:grant', m.id)}
                  className="rounded-md border border-white/15 px-2 py-1 text-[0.68rem] transition hover:border-gilt/60 hover:bg-white/10"
                >{r.room!.controllers.includes(m.id) ? t('revoke') : t('grant')}</button>
                <button onClick={() => r.act('control:transfer', m.id)} title={t('makeHost')} aria-label={t('makeHost')} className="rounded-md border border-white/15 p-1.5 text-gilt transition hover:border-gilt/60 hover:bg-white/10"><Crown className="size-3.5" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-white/10 p-2.5 flex flex-col gap-2">
        {!r.canControl && (
          <button disabled={iAmPending} onClick={r.requestControl} className="w-full rounded-lg bg-blood py-2 text-sm font-semibold transition hover:bg-blood-hot disabled:bg-white/10 disabled:text-dust">
            {iAmPending ? t('requested') : t('requestControl')}
          </button>
        )}
        <button
          onClick={() => {
            r.leaveRoom();
            onClose?.();
          }}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-dust hover:bg-white/10 hover:text-bone transition"
        >
          {t('leaveRoom')}
        </button>
      </div>
    </div>
  );
}