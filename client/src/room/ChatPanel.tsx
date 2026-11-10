import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Close } from '../components/Icons';
import { useI18n } from '../i18n';
import { EMOJIS, useRoom } from './RoomContext';

export function ChatPanel({ className = '', onClose }: { className?: string; onClose: () => void }) {
  const { t, lang } = useI18n();
  const r = useRoom();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { r.setChatOpen(true); return () => r.setChatOpen(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [r.chat.length]);

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    void r.sendChat(v);
    setText('');
  };

  return (
    <div onClick={(e) => e.stopPropagation()} className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-coal/95 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.95)] backdrop-blur-xl animate-fade ${className}`}>
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h3 className="font-display text-sm font-semibold tracking-[0.18em]">{t('chat')}</h3>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-dust transition hover:bg-white/10 hover:text-bone"><Close className="size-4" /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2">
        {r.chat.length === 0 && <p className="py-6 text-center text-sm text-dust">{t('noMessages')}</p>}
        {r.chat.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <Avatar user={{ id: m.userId, name: m.name, avatar: m.avatar }} size={26} />
            <div className="min-w-0">
              <p className="flex items-baseline gap-2 text-xs">
                <span dir="auto" className={`truncate font-semibold ${m.userId === r.me?.id ? 'text-gilt' : 'text-bone'}`}>{m.name}</span>
                <span className="text-[0.65rem] text-dust/70">{new Date(m.at).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
              {/* plain text node → React escapes it; nobody can inject markup */}
              <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-snug text-bone/90">{m.text}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={text}
          maxLength={300}
          dir="auto"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
          placeholder={t('typeMessage')}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none transition focus:border-gilt/60"
        />
        <button onClick={submit} className="rounded-lg bg-blood px-4 text-sm font-semibold transition hover:bg-blood-hot active:scale-95">{t('send')}</button>
      </div>
    </div>
  );
}

export function ReactionTray({ className = '' }: { className?: string }) {
  const r = useRoom();
  return (
    <div onClick={(e) => e.stopPropagation()} className={`flex gap-1 rounded-full border border-white/10 bg-coal/95 p-1.5 shadow-2xl backdrop-blur-xl animate-fade ${className}`}>
      {EMOJIS.map((e) => (
        <button key={e} onClick={() => r.react(e)} className="flex size-9 items-center justify-center rounded-full text-xl transition hover:scale-125 hover:bg-white/10 active:scale-90">{e}</button>
      ))}
    </div>
  );
}

/** Emojis floating up from the bottom — everyone's, with the sender's name. */
export function ReactionLayer() {
  const { reactions } = useRoom();
  return (
    <div className="pointer-events-none absolute inset-0 z-[25] overflow-hidden">
      {reactions.map((x) => {
        const h = [...x.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        return (
          <div key={x.id} className="float-up absolute bottom-24 flex flex-col items-center" style={{ left: `${8 + (h % 80)}%`, ['--r' as string]: `${(h % 41) - 20}deg` }}>
            <span className="text-[clamp(2rem,6cqw,3.6rem)] drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]">{x.emoji}</span>
            <span className="mt-0.5 max-w-24 truncate rounded-full bg-black/60 px-2 py-px text-[0.62rem]">{x.name}</span>
          </div>
        );
      })}
    </div>
  );
}
