/**
 * Host Control Panel - Shows controls + chat for the host.
 * Supports two modes:
 *   - screenShare: host streams via popup window (old mode)
 *   - nativeHls:  NexusNight serves HLS directly to all viewers (new mode)
 */

import { useState } from 'react';
import { Crown, Users, Film, MessageCircle, Trash2, StopCircle, Zap } from './Icons';
import { useRoom } from '../room/RoomContext';
import { useI18n } from '../i18n';
import { Avatar } from './Avatar';
import { ChatPanel } from '../room/ChatPanel';

interface Props {
  title: string;
  subtitle?: string;
  /** 'screenShare' = host has popup; 'nativeHls' = server streaming HLS to everyone */
  mode?: 'screenShare' | 'nativeHls';
  onBack: () => void;
  onStopStream?: () => void;
  onSelectMovie?: () => void;
}

export function HostControlPanel({ title, subtitle, mode = 'screenShare', onBack, onStopStream, onSelectMovie }: Props) {
  const { t } = useI18n();
  const room = useRoom();
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  const members = room.room?.members || [];
  const isNative = mode === 'nativeHls';

  const handleDestroyRoom = async () => {
    if (!confirmDestroy) {
      setConfirmDestroy(true);
      return;
    }
    if (onStopStream) onStopStream();
    await room.destroyRoom();
  };

  const handleSelectMovie = () => {
    if (onStopStream) onStopStream();
    if (onSelectMovie) {
      onSelectMovie();
    } else {
      onBack();
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-ink via-crypt to-ash text-bone overflow-hidden flex">
      {/* Chat sidebar */}
      {chatOpen && (
        <div className="w-80 border-r border-white/10 flex flex-col bg-crypt shrink-0">
          <ChatPanel onClose={() => setChatOpen(false)} className="flex-1 rounded-none border-0 shadow-none bg-transparent" />
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="relative z-10 border-b border-white/10 bg-ink/80 backdrop-blur-md">
          <div className="mx-auto max-w-4xl px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Host badge + member count + stream status */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 rounded-full bg-gilt/20 px-3 py-1 border border-gilt/40">
                  <Crown className="size-4 text-gilt" />
                  <span className="text-xs font-semibold text-gilt">{t('host')}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-dust">
                  <Users className="size-4" />
                  <span>{members.length} {t('watching')}</span>
                </div>
                {/* Stream mode indicator */}
                {isNative ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <Zap className="size-3.5" />
                    <span>{t('nativeStreamActive')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{t('streamingActive')}</span>
                  </div>
                )}
              </div>

              {/* Chat toggle button */}
              <button
                onClick={() => setChatOpen((o) => !o)}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  chatOpen
                    ? 'bg-gilt/20 border border-gilt/40 text-gilt'
                    : 'border border-white/10 bg-white/5 text-dust hover:text-bone hover:bg-white/10'
                }`}
              >
                <MessageCircle className="size-4" />
                <span>الشات</span>
                {room.unread > 0 && !chatOpen && (
                  <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-blood-hot text-[0.6rem] font-bold text-white">
                    {room.unread > 9 ? '9+' : room.unread}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex flex-col items-center justify-center flex-1 p-8">
          <div className="max-w-2xl w-full space-y-6">
            {/* Title Card */}
            <div className="rounded-2xl border border-white/10 bg-crypt/80 p-8 shadow-2xl backdrop-blur-md">
              <div className="text-center mb-8">
                <h1 className="font-display text-3xl font-extrabold text-bone mb-2">{title}</h1>
                {subtitle && <p className="text-gilt font-medium">{subtitle}</p>}
              </div>

              {/* Info box — different for native vs screen-share */}
              {isNative ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-500/20 p-2 shrink-0">
                      <Zap className="size-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-bone mb-1">البث المباشر التلقائي 🚀</h3>
                      <p className="text-xs text-dust leading-relaxed">
                        السيرفر يبث الفيلم مباشرةً لجميع المشاهدين بدون إعلانات وبأعلى جودة.
                        لست محتاجاً لأي نافذة منبثقة — البث يعمل تلقائياً.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-500/20 p-2 shrink-0">
                      <Crown className="size-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-bone mb-1">{t('hostControlMode')}</h3>
                      <p className="text-xs text-dust leading-relaxed">{t('hostControlDescription')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                {/* Select another movie */}
                <button
                  onClick={handleSelectMovie}
                  className="flex items-center justify-center gap-3 rounded-xl border border-gilt/40 bg-gilt/10 px-6 py-3.5 text-sm font-bold text-gilt transition hover:bg-gilt/20 active:scale-95"
                >
                  <Film className="size-5" />
                  <span>اختيار فيلم آخر</span>
                </button>

                {/* Stop stream — only show in screen-share mode (native mode has no popup to stop) */}
                {!isNative && onStopStream && (
                  <button
                    onClick={onStopStream}
                    className="flex items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-dust transition hover:bg-white/10 hover:text-bone active:scale-95"
                  >
                    <StopCircle className="size-5" />
                    <span>إنهاء البث</span>
                  </button>
                )}

                {/* Destroy room for everyone (with confirmation) */}
                {confirmDestroy ? (
                  <div className="rounded-xl border border-blood/40 bg-blood/10 p-4">
                    <p className="text-sm text-center text-bone mb-3">سيتم إخراج الجميع من الغرفة. هل أنت متأكد؟</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDestroy(false)}
                        className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-dust transition hover:bg-white/10"
                      >
                        إلغاء
                      </button>
                      <button
                        onClick={() => void handleDestroyRoom()}
                        className="flex-1 rounded-xl bg-blood px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blood-hot active:scale-95"
                      >
                        نعم، احذف الغرفة
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => void handleDestroyRoom()}
                    className="flex items-center justify-center gap-3 rounded-xl border border-blood/40 bg-blood/10 px-6 py-3.5 text-sm font-bold text-red-400 transition hover:bg-blood/20 active:scale-95"
                  >
                    <Trash2 className="size-5" />
                    <span>حذف الغرفة للجميع</span>
                  </button>
                )}
              </div>
            </div>

            {/* Members list */}
            <div className="rounded-xl border border-white/10 bg-crypt/60 p-4 backdrop-blur-md">
              <h3 className="text-sm font-semibold text-bone mb-3 flex items-center gap-2">
                <Users className="size-4 text-gilt" />
                {t('viewers')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
                  >
                    <Avatar user={m} size={20} />
                    <span className="text-xs text-bone">{m.name}</span>
                    {m.isHost && <Crown className="size-3 text-gilt" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
