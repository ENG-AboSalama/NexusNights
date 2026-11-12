import { forwardRef, useState } from 'react';
import type { PlayerHandle } from '../player/Player';
import { Player } from '../player/Player';
import { ChatPanel } from '../room/ChatPanel';
import { useRoom } from '../room/RoomContext';
import { useI18n } from '../i18n';
import type { EpisodeDetail, PlaybackConfigPublic } from '../api-types';
import { MessageCircle, Users, X } from './Icons';

interface Props {
  media: EpisodeDetail;
  title: string;
  subtitle?: string;
  streamingConfig?: PlaybackConfigPublic | null;
  startAt: number;
  hold: string | null;
  onBack: () => void;
  onEnded: () => void;
  onReady: () => void;
  onProgress: (t: number, d: number) => void;
}

/**
 * Watch Party Player - Special layout for synchronized viewing
 * - Chat panel on the left
 * - Player on the right with host-only controls
 * - Viewers can only fullscreen
 */
export const WatchPartyPlayer = forwardRef<PlayerHandle, Props>(
  ({ media, title, subtitle, streamingConfig, startAt, hold, onBack, onEnded, onReady, onProgress }, ref) => {
    const { t } = useI18n();
    const room = useRoom();
    const [showChat, setShowChat] = useState(true);

    const isHost = room.isHost;
    const canControl = room.canControl;
    
    // Auto-play if room state says it's playing
    const shouldAutoPlay = room.state?.playing ?? false;

    const guard = (fn: () => void) => () => (canControl ? fn() : room.toast(t('onlyHost')));

    return (
      <div className="fixed inset-0 bg-ink flex">
        {/* Chat Panel - Left Side */}
        {showChat && (
          <div className="w-80 border-r border-white/10 flex flex-col bg-crypt">
            {/* Chat Header */}
            <div className="h-14 border-b border-white/10 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-5 text-gilt" />
                <span className="font-semibold text-bone">{t('chat')}</span>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="text-dust hover:text-bone transition"
                aria-label="Close chat"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-hidden">
              <ChatPanel onClose={() => setShowChat(false)} />
            </div>

            {/* Room Info */}
            <div className="border-t border-white/10 p-3 bg-ash/50">
              <div className="flex items-center gap-2 text-sm text-dust">
                <Users className="size-4" />
                <span>{room.room?.members.length || 0} {t('watching')}</span>
              </div>
              {isHost && (
                <div className="mt-2 text-xs text-gilt">
                  {t('youAreHost')}
                </div>
              )}
              {!canControl && (
                <div className="mt-2 text-xs text-dust">
                  {t('hostControlsPlayback')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Player Area - Right Side */}
        <div className="flex-1 flex flex-col relative">
          {/* Top Bar */}
          <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-crypt/95 backdrop-blur">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-dust hover:text-bone transition"
                aria-label="Back"
              >
                ←
              </button>
              <div>
                <h1 className="text-bone font-semibold">{title}</h1>
                {subtitle && <p className="text-sm text-dust">{subtitle}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!showChat && (
                <button
                  onClick={() => setShowChat(true)}
                  className="flex items-center gap-2 rounded-lg border border-gilt/30 bg-gilt/10 px-3 py-1.5 text-sm text-gilt transition hover:border-gilt hover:bg-gilt/20"
                >
                  <MessageCircle className="size-4" />
                  <span>{t('showChat')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Player Container */}
          <div className="flex-1 flex items-center justify-center bg-black">
            <div className="w-full h-full">
              <Player
                ref={ref}
                media={media}
                title={title}
                subtitle={subtitle}
                streamingConfig={streamingConfig}
                startAt={startAt}
                autoPlay={shouldAutoPlay}
                controlled={true} // Room controls this
                canControl={canControl}
                onDisabledControlClick={() => room.toast(t('onlyHost'))}
                intentPlaying={!!room.state?.playing}
                hideSpeed={true}
                holdLabel={hold}
                hasNext={false} // Hide next button in party mode
                onBack={onBack}
                onNext={() => {}}
                onEnded={onEnded}
                onReady={onReady}
                onProgress={onProgress}
                onBuffering={(k: 'load' | 'stall', v: boolean) => room.setBuffering(k, v)}
                onUserPlay={(tt: number) => guard(() => void room.send({ type: 'play', position: tt }))()}
                onUserPause={(tt: number) => guard(() => void room.send({ type: 'pause', position: tt }))()}
                onUserSeek={(tt: number) => guard(() => void room.send({ type: 'seek', position: tt }))()}
                onSubtitleChange={(subId: string | null) => guard(() => void room.send({ type: 'subtitle', subtitleId: subId }))()}
                onAudioChange={(trackIdx: number) => guard(() => void room.send({ type: 'audio', audioTrack: trackIdx }))()}
                onSpeedChange={(rate: number) => guard(() => void room.send({ type: 'speed', playbackRate: rate }))()}
                theatreMode={true}
              />
            </div>
          </div>

          {/* Hold Message Overlay */}
          {hold && (
            <div className="absolute inset-x-0 bottom-20 flex justify-center pointer-events-none z-50">
              <div className="rounded-full bg-gilt/90 px-6 py-2 text-sm font-medium text-ink shadow-lg backdrop-blur">
                {hold}
              </div>
            </div>
          )}

          {/* Non-Host Notice */}
          {!canControl && (
            <div className="absolute top-20 right-4 rounded-lg border border-blood/30 bg-blood/10 px-4 py-2 text-sm text-blood-hot backdrop-blur z-40">
              {t('hostOnlyControls')}
            </div>
          )}
        </div>
      </div>
    );
  }
);

WatchPartyPlayer.displayName = 'WatchPartyPlayer';
