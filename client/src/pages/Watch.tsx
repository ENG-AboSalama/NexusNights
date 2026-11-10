import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { PlaybackConfigPublic } from '../api-types';
import { ErrorState } from '../components/States';
import { Skel } from '../components/Skeleton';
import { Spinner } from '../components/Icons';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { Player, type PlayerHandle } from '../player/Player';
import { getProgress, isFinished, saveProgress } from '../progress';
import { RoomButtons, RoomOverlay, type Panel } from '../room/RoomControls';
import { useRoom } from '../room/RoomContext';
import { useRoomSync } from '../room/useRoomSync';
import { go } from '../router';
import { prewarmNextEpisode, cancelPrewarm, shouldStartPrewarm } from '../util/prewarm';

export function Watch({ id }: { id: string }) {
  const { lang, t } = useI18n();
  const room = useRoom();
  const m = useAsync((s) => api.media(id, lang, s), [id, lang]);
  const handle = useRef<PlayerHandle>(null);
  const [ready, setReady] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [streamingConfig, setStreamingConfig] = useState<PlaybackConfigPublic | null>(null);
  const [streamingLoading, setStreamingLoading] = useState(false);
  const [streamingError, setStreamingError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('is-watching');
    return () => document.body.classList.remove('is-watching');
  }, []);

  const media = m.data;

  // ── Fetch streaming config if no local playback available ────────────────────
  useEffect(() => {
    console.log('[Watch] Streaming fetch check:', { 
      hasMedia: !!media, 
      tmdbId: media?.tmdbId, 
      hasPlayback: !!media?.playback,
      tmdbType: media?.tmdbType,
      kind: media?.kind 
    });

    if (!media || !media.tmdbId || media.playback) {
      console.log('[Watch] Skipping streaming fetch');
      setStreamingConfig(null);
      setStreamingError(null);
      return;
    }

    console.log('[Watch] Starting streaming fetch for:', media.tmdbType || media.kind, media.tmdbId);

    const ac = new AbortController();
    setStreamingLoading(true);
    setStreamingError(null);

    const fetchStreaming = async () => {
      try {
        let response;
        if (media.tmdbType === 'movie' || media.kind === 'movie') {
          console.log('[Watch] Fetching movie playback:', media.tmdbId);
          response = await api.playbackMovie(media.tmdbId!, lang);
        } else if (media.season !== null && media.episode !== null) {
          console.log('[Watch] Fetching TV playback:', media.tmdbId, media.season, media.episode);
          response = await api.playbackTV(media.tmdbId!, media.season, media.episode, lang);
        } else {
          throw new Error('Invalid media type for streaming');
        }

        console.log('[Watch] Streaming response received:', { hasSource: !!response.playback.source, alternatives: response.playback.alternatives.length });

        if (!ac.signal.aborted) {
          setStreamingConfig(response.playback);
          setStreamingLoading(false);
        }
      } catch (err) {
        console.error('[Watch] Streaming fetch error:', err);
        if (!ac.signal.aborted) {
          setStreamingError(err instanceof Error ? err.message : 'Failed to load streaming sources');
          setStreamingLoading(false);
        }
      }
    };

    void fetchStreaming();
    return () => ac.abort();
  }, [media?.id, media?.tmdbId, media?.playback, media?.kind, media?.season, media?.episode, media?.tmdbType, lang]);
  // Watching together = the room is configured and its connection did not fail.
  const roomMode = room.active && room.connection !== 'error';
  const connected = room.connection === 'connected' && !!room.me && !!room.state;
  const selected = room.state?.mediaId === id;

  // In a room, opening an episode means "ask the room to play it" (only controllers may).
  const selectSent = useRef(false);
  useEffect(() => {
    selectSent.current = false;
  }, [id]);

  useEffect(() => {
    if (!roomMode || !connected || selected || !media) return;
    if (room.canControl) {
      if (selectSent.current) return;
      selectSent.current = true;
      const p = getProgress(id);
      void room.send({ type: 'select', mediaId: id, position: p && !isFinished(p) && p.t > 10 ? p.t : 0 });
    } else {
      // If room has selected another media, follow the host
      if (room.state?.mediaId && room.state.mediaId !== id) {
        go.watch(room.state.mediaId);
      }
    }
  }, [roomMode, connected, selected, media, room.canControl, id, room.state?.mediaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useRoomSync({ room, mediaId: id, handle, ready, onNeedsGesture: setNeedsGesture });

  // Next episode pre-warming
  const prewarmInitiated = useRef(false);
  useEffect(() => {
    if (!media?.nextId) return;

    // Reset prewarm flag when episode changes
    prewarmInitiated.current = false;

    return () => {
      // Cancel prewarm when unmounting or changing episodes
      cancelPrewarm();
    };
  }, [media?.nextId]);

  // Monitor playback progress for pre-warming
  useEffect(() => {
    if (!ready || !media || !media.nextId || prewarmInitiated.current) return;

    const checkPrewarm = () => {
      const currentHandle = handle.current;
      if (!currentHandle) return;

      const currentTime = currentHandle.getTime();
      const duration = media.runtimeSec || 0;

      if (shouldStartPrewarm(currentTime, duration)) {
        prewarmInitiated.current = true;
        prewarmNextEpisode(media.nextId!, lang);
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkPrewarm, 5000);
    // Also check immediately
    checkPrewarm();

    return () => clearInterval(interval);
  }, [ready, media, lang, handle]);

  const startAt = useMemo(() => {
    const p = getProgress(id);
    return p && !isFinished(p) && p.t > 10 ? p.t : 0;
  }, [id]);

  if (m.error && !media) {
    const nf = m.error instanceof ApiError && m.error.status === 404;
    return <ErrorState title={nf ? t('notFound') : t('loadError')} hint={nf ? t('notFoundHint') : t('loadErrorHint')} onRetry={nf ? () => go.home() : m.reload} />;
  }
  if (!media) return <div className="fixed inset-0 bg-black"><Skel className="size-full rounded-none opacity-40" /></div>;

  if (roomMode && (!connected || !selected)) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black">
        <Spinner className="size-10 text-gilt" />
        <p className="font-display tracking-wide">{room.connection === 'connected' ? t('waitingRoom') : t('connecting')}</p>
        <button
          onClick={room.leaveRoom}
          className="mt-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs text-dust hover:text-bone hover:bg-white/10 transition"
        >
          {t('leaveRoom')}
        </button>
      </div>
    );
  }

  const isSeries = media.kind === 'series';
  const sub = isSeries
    ? [media.season !== null ? t('season', { n: media.season }) : null, media.episode !== null ? t('episodeLong', { n: media.episode }) : null, /^(?:Episode|الحلقة) \d+$/.test(media.title) ? null : media.title].filter(Boolean).join(' · ')
    : undefined;

  const guard = (fn: () => void) => () => (room.canControl ? fn() : room.toast(t('onlyHost')));
  const hold = roomMode && room.state?.hold && room.waitingFor.length ? t('waitingFor', { names: room.waitingFor.join(', ') }) : null;

  const next = () => {
    if (!media.nextId) return;
    if (!roomMode) return go.watch(media.nextId);
    if (room.canControl) void room.send({ type: 'select', mediaId: media.nextId, position: 0 });
  };

  const handleBack = () => {
    if (media.tmdbId && (media.titleId.startsWith('movie-') || media.titleId.startsWith('tv-'))) {
      go.globalTitle(media.kind === 'series' ? 'series' : 'movie', media.tmdbId);
    } else {
      go.title(media.titleId);
    }
  };

  return (
    <Player
      key={media.id}
      ref={handle}
      media={media}
      streamingConfig={streamingConfig}
      streamingLoading={streamingLoading}
      streamingError={streamingError}
      title={isSeries ? media.titleName : media.title}
      subtitle={sub}
      startAt={roomMode ? 0 : startAt}
      autoPlay={!roomMode}
      controlled={roomMode}
      hasNext={isSeries && !!media.nextId}
      onBack={handleBack}
      onNext={next}
      onProgress={(tt, d) =>
        saveProgress(media.id, tt, d, {
          provider: streamingConfig?.source?.provider || (media.playback ? 'local' : undefined),
          tmdbId: media.tmdbId,
          kind: media.kind === 'series' ? 'tv' : 'movie',
          season: media.season ?? undefined,
          episode: media.episode ?? undefined,
        })
      }
      onReady={() => setReady(true)}
      {...(roomMode
        ? {
            intentPlaying: !!room.state?.playing,
            hideSpeed: true,
            holdLabel: hold,
            onBuffering: (k: 'load' | 'stall', v: boolean) => room.setBuffering(k, v),
            onUserPlay: (tt: number) => guard(() => void room.send({ type: 'play', position: tt }))(),
            onUserPause: (tt: number) => guard(() => void room.send({ type: 'pause', position: tt }))(),
            onUserSeek: (tt: number) => guard(() => void room.send({ type: 'seek', position: tt }))(),
            onEnded: () => { if (room.canControl) void room.send({ type: 'pause', position: media.runtimeSec ?? 0 }); },
            extraControls: <RoomButtons panel={panel} setPanel={setPanel} />,
            overlay: <RoomOverlay panel={panel} setPanel={setPanel} gesture={needsGesture} onGesture={() => { void handle.current?.play().then(() => setNeedsGesture(false)); }} />,
          }
        : {})}
    />
  );
}
