import { useEffect, useRef, useState } from 'react';
import { api, u } from '../api';
import { startServerStream } from '../streaming';
import type { EpisodeDetail, PlaybackConfigPublic } from '../api-types';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import {
  Check,
  Copy,
  Crown,
  Globe,
  Lock,
  Play,
  Send,
  Sigil,
  Spinner,
  Users,
  X,
  Zap,
  Tv,
} from '../components/Icons';
import { fmtRuntime } from '../format';
import { useI18n } from '../i18n';
import { EMOJIS, useRoom, type ControlMode } from './RoomContext';

interface Props {
  media: EpisodeDetail | null;
  streamingConfig?: PlaybackConfigPublic | null;
  onStart?: (customConfig?: PlaybackConfigPublic) => void;
  onStartServerStream?: (hlsUrl: string) => void;
  onLeave?: () => void;
}

export function WaitingRoom({ media, streamingConfig, onStart, onStartServerStream, onLeave }: Props) {
  const { t, lang, toggle } = useI18n();
  const auth = useAuth();
  const room = useRoom();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDiscord, setCopiedDiscord] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [starting, setStarting] = useState(false);
  const [activeMethod, setActiveMethod] = useState<'native' | 'screenshare' | null>(null);
  const [serverStreamError, setServerStreamError] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const members = room.room?.members || [];
  const host = members.find((m) => m.isHost);
  const isHost = room.isHost;
  const isConnected = room.connection === 'connected';

  const handleLeave = () => {
    if (onLeave) {
      onLeave();
    } else {
      room.leaveRoom();
    }
    window.location.hash = '#/';
  };

  // Share URL
  const shareUrl = room.roomId
    ? `${window.location.origin}/#/watch/${media?.id || ''}?room=${room.roomId}`
    : window.location.href;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyDiscordShare = () => {
    const movieTitle = media?.kind === 'series' ? media?.titleName : media?.title || 'NexusNight';
    const discordMessage = lang === 'ar'
      ? `🎬 تعال نتفرج سوا على "${movieTitle}" في NexusNight!\nرابط الغرفة: ${shareUrl}`
      : `🎬 Join me to watch "${movieTitle}" on NexusNight!\nRoom link: ${shareUrl}`;
    navigator.clipboard.writeText(discordMessage);
    setCopiedDiscord(true);
    setTimeout(() => setCopiedDiscord(false), 2500);
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    void room.sendChat(text);
    setChatInput('');
  };

  // Option 1: Native Stream Resolver (Fast, original Player UI, no popup)
  const handleStartNative = async () => {
    if (starting || !room.roomId) return;
    setStarting(true);
    setActiveMethod('native');
    setServerStreamError(null);
    setCaptureStatus(t('resolvingStream'));

    try {
      if (media?.tmdbId && !media?.playback) {
        const res = await api.resolveNativeStream({
          tmdbId: media.tmdbId,
          kind: media.kind === 'series' ? 'series' : 'movie',
          season: media.season ?? undefined,
          episode: media.episode ?? undefined,
        });

        const nativeConfig: PlaybackConfigPublic = {
          source: {
            url: res.streamUrl,
            type: 'hls',
            quality: '1080p',
            provider: `${res.provider} (Direct HLS)`,
          },
          alternatives: streamingConfig?.alternatives || [],
          subtitles: streamingConfig?.subtitles || [],
          canAutoSwitch: false,
          hasLocal: false,
          localMediaId: null,
          diagnosticsCount: 0,
        };

        setCaptureStatus(t('streamReadyStarting'));
        await new Promise((r) => setTimeout(r, 600));

        if (onStart) {
          onStart(nativeConfig);
        } else {
          await room.startRoom();
        }
      } else {
        // Local media playback
        if (onStart) {
          onStart();
        } else {
          await room.startRoom();
        }
      }
    } catch (err: any) {
      console.error('[WaitingRoom] Failed to resolve native stream:', err);
      const errorMsg = err instanceof Error ? err.message : (lang === 'ar' ? 'فشل استخراج البث الأصلي' : 'Failed to resolve native stream');
      setServerStreamError(`${errorMsg}. ${lang === 'ar' ? 'يمكنك استخدام بث شاشة المضيف كخيار بديل.' : 'You can use host screen share as fallback.'}`);
      setStarting(false);
      setActiveMethod(null);
      setCaptureStatus(null);
    }
  };

  // Option 2: Host Screen Share (Manual, captures browser tab via popup)
  const handleStartScreenShare = async () => {
    if (starting || !room.roomId) return;
    setStarting(true);
    setActiveMethod('screenshare');
    setServerStreamError(null);

    try {
      const embedUrl = streamingConfig?.source?.embedUrl ||
        (streamingConfig?.source?.type === 'embed' ? streamingConfig?.source?.url : undefined) ||
        streamingConfig?.alternatives?.[0]?.embedUrl ||
        (streamingConfig?.alternatives?.[0]?.type === 'embed' ? streamingConfig?.alternatives?.[0]?.url : undefined);

      if (!embedUrl) {
        throw new Error(lang === 'ar' ? 'لا يوجد مشغل خارجي متاح لبث الشاشة' : 'No external player available for screen share');
      }

      setCaptureStatus(lang === 'ar' ? 'جاري فتح المشغل...' : 'Opening player…');
      const proxyUrl = `/api/proxy/embed?url=${encodeURIComponent(embedUrl)}`;

      const { openEmbedPopup, capturePopupVideo } = await import('../streaming/embed-popup');
      const popup = openEmbedPopup(proxyUrl);
      if (!popup) {
        throw new Error(lang === 'ar' ? 'فشل فتح نافذة المشغل. يرجى السماح بالنوافذ المنبثقة.' : 'Failed to open player window. Please allow popups.');
      }

      setCaptureStatus(lang === 'ar' ? 'اختر نافذة المشغل لبدء البث...' : 'Select the player window to start streaming…');
      const stream = await capturePopupVideo(popup, 30000);

      setCaptureStatus(lang === 'ar' ? '✓ تم التقاط الشاشة! جاري البث للخادم...' : '✓ Screen captured! Streaming to server…');
      const { WebSocketStreamer } = await import('../streaming/websocket-streamer');
      const streamer = new WebSocketStreamer({
        roomId: room.roomId,
        stream: stream,
      });

      const token = localStorage.getItem('nexusnight_token') || sessionStorage.getItem('umbra:gid') || 'guest';
      await streamer.start(token);

      const hlsUrl = `/hls/${room.roomId}/index.m3u8`;
      setCaptureStatus(lang === 'ar' ? 'جاري تجهيز البث للمشاهدين...' : 'Preparing stream for viewers…');

      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const res = await fetch(hlsUrl, { cache: 'no-store' });
          if (res.ok) {
            const text = await res.text();
            if (text.includes('#EXTM3U')) break;
          }
        } catch {}
      }

      setCaptureStatus(t('streamReadyStarting'));
      if (onStartServerStream) {
        onStartServerStream(hlsUrl);
      }
      await room.send({ type: 'stream:start', hlsUrl });
      setCaptureStatus(null);
    } catch (err: any) {
      console.error('[WaitingRoom] Failed to start screen share:', err);
      const errorMsg = err instanceof Error ? err.message : t('streamShareFailed');
      setServerStreamError(errorMsg);
      setStarting(false);
      setActiveMethod(null);
      setCaptureStatus(null);
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.chat.length]);

  const bgImage = media?.stillUrl ? u(media.stillUrl) : media?.thumbUrl ? u(media.thumbUrl) : null;
  const posterImage = media?.thumbUrl ? u(media.thumbUrl) : null;
  const isSeries = media?.kind === 'series';
  const displayTitle = isSeries ? media.titleName : media?.title || t('watchParty');
  const episodeTag = isSeries
    ? [
        media.season !== null ? t('season', { n: media.season }) : null,
        media.episode !== null ? t('episodeLong', { n: media.episode }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const runtimeStr = media?.runtimeSec ? fmtRuntime(media.runtimeSec, t) : null;
  const yearStr = media?.airDate ? new Date(media.airDate).getFullYear() : null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex flex-col bg-ink text-bone overflow-hidden select-none"
    >
      {/* ── Ambient Blurred Backdrop ── */}
      {bgImage && (
        <div
          className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-25 blur-2xl scale-110 transition-opacity duration-1000"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
      )}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-ink/60 to-ink" />

      {/* ── Top Bar (Standard NexusNight Brand) ── */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-ink/75 px-4 sm:px-6 py-3 sm:py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <a href="#/" className="group flex items-center gap-2" aria-label="Home">
            <Sigil className="size-7 text-blood-hot transition-transform duration-500 group-hover:rotate-180" />
            <span lang="en" dir="ltr" className="font-[Cinzel] text-[1.45rem] font-extrabold tracking-[0.02em] text-bone">
              <span className="text-blood-hot">NEXUS</span>
              <span className="text-gilt">NIGHT</span>
            </span>
          </a>

          <div className="hidden sm:block h-5 w-[1px] bg-white/10 mx-1" />

          <div className="hidden sm:flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[0.7rem] font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('roomLive')}
            </span>
            <span className="text-xs text-dust">{t('waitingRoomTitle')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Language Switcher */}
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-dust transition hover:border-gilt/40 hover:text-bone"
            title={t('language')}
          >
            <Globe className="size-3.5 text-gilt" />
            <span className="font-sans">{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {/* Leave Room Button */}
          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-dust transition hover:border-blood/40 hover:bg-blood/15 hover:text-blood-hot active:scale-95"
            title={t('leaveRoom')}
          >
            <X className="size-4" />
            <span>{t('leaveRoom')}</span>
          </button>
        </div>
      </header>

      {/* ── Main Layout: Media Info & Lobby ── */}
      <main className="relative z-10 flex-1 overflow-y-auto p-4 md:p-8 pb-36">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Media Presentation & Sharing (7 cols) */}
          <section className="flex flex-col gap-5 lg:col-span-7">
            <div className="flex flex-col sm:flex-row gap-5 rounded-2xl border border-white/10 bg-crypt/80 p-5 shadow-2xl backdrop-blur-md">
              {/* Poster */}
              {posterImage && (
                <div className="shrink-0 mx-auto sm:mx-0 w-36 sm:w-44 overflow-hidden rounded-xl border border-gilt/30 shadow-xl bg-ash">
                  <img
                    src={posterImage}
                    alt={displayTitle}
                    className="aspect-[2/3] w-full object-cover transition duration-300 hover:scale-105"
                  />
                </div>
              )}

              {/* Media Details */}
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="rounded-md bg-gilt/20 px-2 py-0.5 text-[0.7rem] font-semibold text-gilt border border-gilt/30">
                      {isSeries ? t('series') : t('movie')}
                    </span>
                    {yearStr && <span className="text-xs text-dust">{yearStr}</span>}
                    {runtimeStr && (
                      <>
                        <span className="text-xs text-dust/50">·</span>
                        <span className="text-xs text-dust">{runtimeStr}</span>
                      </>
                    )}
                  </div>

                  <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-bone leading-tight">
                    {displayTitle}
                  </h1>

                  {episodeTag && (
                    <p className="mt-1 text-sm font-medium text-gilt/90">{episodeTag}</p>
                  )}

                  {media?.overview && (
                    <p className="mt-3 text-xs sm:text-sm text-dust line-clamp-4 leading-relaxed">
                      {media.overview}
                    </p>
                  )}
                </div>

                {/* Host indicator */}
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-dust">
                  <Crown className="size-4 text-gilt" />
                  <span>
                    {t('host')}: <strong className="text-bone">{host?.name || '...'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Share / Invite Section - Highly visible and prominent */}
            <div className="rounded-2xl border border-white/10 bg-crypt/90 p-5 shadow-2xl backdrop-blur-md relative z-20">
              <h2 className="text-sm font-semibold text-bone mb-3 flex items-center gap-2">
                <Users className="size-4 text-gilt" />
                <span>{t('inviteFriends')}</span>
              </h2>

              <div className="flex flex-col gap-3">
                <div className="flex items-center rounded-xl border border-white/15 bg-ink/90 px-3 py-2.5 text-xs text-bone font-mono shadow-inner">
                  <span className="truncate select-all">{shareUrl}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={copyLink}
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-xl bg-gilt px-4 py-2.5 text-xs font-bold text-ink shadow-[0_0_15px_rgba(212,175,55,0.2)] transition duration-150 hover:bg-gilt/90 active:scale-95"
                  >
                    {copiedLink ? <Check className="size-4" /> : <Copy className="size-4" />}
                    <span>{copiedLink ? t('copied') : t('roomLink')}</span>
                  </button>
                  <button
                    onClick={copyDiscordShare}
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-xl border border-[#5865F2]/50 bg-[#5865F2] px-4 py-2.5 text-xs font-bold text-white shadow-[0_0_15px_rgba(88,101,242,0.4)] transition duration-150 hover:bg-[#4752c4] active:scale-95"
                  >
                    {copiedDiscord ? <Check className="size-4" /> : <Send className="size-4" />}
                    <span>{copiedDiscord ? t('copiedDiscord') : t('shareDiscord')}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Lobby Participants & Live Chat (5 cols) */}
          <section className="flex flex-col gap-5 lg:col-span-5">
            {/* Participants Card */}
            <div className="rounded-2xl border border-white/10 bg-crypt/80 p-5 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-gilt" />
                  <h2 className="text-sm font-semibold text-bone">
                    {t('watchersInLobby', { n: members.length })}
                  </h2>
                </div>
                <span className="text-xs text-dust">
                  {room.room?.mode === 'everyone' ? t('everyoneCanControl') : t('hostControlOnly')}
                </span>
              </div>

              {/* Members List */}
              <div className="mt-3 flex flex-wrap gap-2.5 max-h-44 overflow-y-auto py-1">
                {members.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-dust py-2">
                    <Spinner className="size-4 text-gilt" />
                    <span>{t('connecting')}</span>
                  </div>
                ) : (
                  members.map((m) => {
                    const isMe = m.id === room.me?.id;
                    return (
                      <div
                        key={m.id}
                        className={`group relative flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
                          m.isHost
                            ? 'border-gilt/40 bg-gilt/10 shadow-[0_0_12px_rgba(212,175,55,0.15)]'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="relative">
                          <Avatar user={m} size={28} />
                          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-ink" />
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-bone max-w-[100px] truncate">
                              {m.name}
                            </span>
                            {m.isHost && (
                              <span title={t('host')}>
                                <Crown className="size-3 text-gilt shrink-0" />
                              </span>
                            )}
                            {isMe && (
                              <span className="rounded bg-white/10 px-1 py-0.2 text-[0.6rem] text-dust">
                                {t('you')}
                              </span>
                            )}
                          </div>
                          <span className="text-[0.65rem] text-dust">
                            {m.isHost ? t('host') : m.canControl ? t('hostControlOnly') : t('viewer')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Lobby Live Chat & Reactions */}
            <div className="flex flex-1 flex-col rounded-2xl border border-white/10 bg-crypt/80 p-4 shadow-2xl backdrop-blur-md min-h-[260px]">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs font-semibold text-bone">{t('lobbyChat')}</span>
                {/* Quick Emoji Reactions */}
                <div className="flex items-center gap-1">
                  {EMOJIS.slice(0, 5).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => room.react(emoji)}
                      className="size-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-sm transition active:scale-125"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Message Box */}
              <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1 text-xs max-h-52">
                {room.chat.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-dust text-xs italic py-6">
                    {t('popcornReady')}
                  </div>
                ) : (
                  room.chat.map((msg) => {
                    const isMe = msg.userId === room.me?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 ${isMe ? 'flex-row-reverse text-right' : ''}`}
                      >
                        <Avatar user={{ id: msg.userId, name: msg.name, avatar: msg.avatar }} size={22} />
                        <div
                          className={`max-w-[78%] rounded-xl px-3 py-1.5 text-xs ${
                            isMe
                              ? 'bg-gilt text-ink font-medium shadow-sm'
                              : 'bg-white/10 text-bone'
                          }`}
                        >
                          {!isMe && (
                            <div className="font-semibold text-[0.65rem] text-gilt mb-0.5">
                              {msg.name}
                            </div>
                          )}
                          <div className="break-words">{msg.text}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t('saySomethingInLobby')}
                  className="flex-1 rounded-xl border border-white/10 bg-ink px-3 py-2 text-xs text-bone placeholder:text-dust/60 focus:border-gilt/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="flex items-center justify-center rounded-xl bg-gilt px-3 py-2 text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gilt/90 transition"
                  aria-label="Send"
                >
                  <Send className="size-3.5" />
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>

      {/* ── Bottom Action Dock ── */}
      <footer className="relative z-10 border-t border-white/10 bg-ink/90 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4">
          {/* Status info or Host settings */}
          <div className="flex items-center gap-3">
            {isHost ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-dust">{t('controlMode')}:</span>
                <button
                  onClick={() =>
                    room.setMode(room.room?.mode === 'everyone' ? 'host' : 'everyone')
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-bone hover:bg-white/10 transition"
                >
                  {room.room?.mode === 'everyone' ? (
                    <>
                      <Users className="size-3.5 text-emerald-400" />
                      <span>{t('everyoneCanControl')}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="size-3.5 text-gilt" />
                      <span>{t('hostControlOnly')}</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-xs text-dust">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-gilt opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-gilt" />
                </span>
                <span>{t('waitingForHost')}</span>
              </div>
            )}
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 relative">
            {isHost ? (
              <>
                {media?.tmdbId && !media?.playback ? (
                  <>
                    {/* Option 1: Native Stream (Recommended) */}
                    <button
                      onClick={handleStartNative}
                      disabled={starting || !isConnected}
                      className="group relative flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blood to-blood-hot px-6 py-3.5 font-display text-sm font-bold tracking-wide text-white shadow-[0_0_25px_rgba(186,24,27,0.5)] transition duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {starting && activeMethod === 'native' ? (
                        <Spinner className="size-5 text-white animate-spin" />
                      ) : (
                        <Zap className="size-5 text-gilt fill-gilt transition group-hover:scale-110" />
                      )}
                      <span>{t('startAutoStreamNative')}</span>
                    </button>

                    {/* Option 2: Host Screen Share (Manual Fallback) */}
                    <button
                      onClick={handleStartScreenShare}
                      disabled={starting || !isConnected}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-3.5 font-display text-xs font-semibold text-bone transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      title={t('screenShareDesc')}
                    >
                      {starting && activeMethod === 'screenshare' ? (
                        <Spinner className="size-4 text-dust animate-spin" />
                      ) : (
                        <Tv className="size-4 text-dust" />
                      )}
                      <span>{t('startScreenShareManual')}</span>
                    </button>
                  </>
                ) : (
                  /* Local Library Media Playback */
                  <button
                    onClick={handleStartNative}
                    disabled={starting || !isConnected}
                    className="group relative flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blood to-blood-hot px-6 py-3.5 font-display text-sm font-bold tracking-wide text-white shadow-[0_0_25px_rgba(186,24,27,0.5)] transition duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {starting ? (
                      <Spinner className="size-5 text-white" />
                    ) : (
                      <Play className="size-5 text-white fill-white transition group-hover:scale-110" />
                    )}
                    <span>{t('startWatchingForEveryone')}</span>
                  </button>
                )}

                {/* Status Display */}
                {captureStatus && (
                  <div className="absolute top-full mt-2 left-0 right-0 rounded-lg border border-gilt/30 bg-gilt/10 px-4 py-2 text-xs text-gilt backdrop-blur flex items-center gap-2 z-50">
                    <Spinner className="size-3.5 text-gilt" />
                    <span>{captureStatus}</span>
                  </div>
                )}

                {/* Error Display */}
                {serverStreamError && (
                  <div className="absolute top-full mt-2 left-0 right-0 rounded-lg border border-blood/30 bg-blood/10 px-4 py-2 text-xs text-blood-hot backdrop-blur z-50">
                    ⚠️ {serverStreamError}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-xs text-bone">
                <Spinner className="size-4 text-gilt" />
                <span>{t('popcornReady')}</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
