import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerJsAdapter } from '@videojs/playerjs-video';
import { ArrowLeft, ExitFullscreen, Fullscreen, Pause, Play, Subtitles, Volume } from '../../components/Icons';
import { clamp, fmtTime } from '../../format';
import { useI18n } from '../../i18n';
import { EMPTY_CAPABILITIES, PROVIDER_COMPATIBILITY_REPORTS } from './provider-compatibility';
import { mapProviderEmbedUrl, remapVidApiNestedPlayerFrame } from '../../util/url-utils';
import type { EmbedPlayerCapabilities, EmbedPlayerState } from './types';
import './nexusnight-videojs-skin.css';

interface UniversalEmbedPlayerProps {
  initialSrc?: string;
  providerId?: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
}

const TEST_PRESETS = [
  { id: 'playerjs-reference', name: 'Verified Player.js (Local Test Receiver)', url: '/test-playerjs-embed.html' },
  { id: 'vimeo', name: 'Vimeo Reference (Player.js Compliant)', url: 'https://player.vimeo.com/video/76979871?autoplay=0' },
  { id: 'vixsrc', name: 'VixSrc (Opaque Embed)', url: 'https://vixsrc.to/movie/1368337' },
  { id: 'vidsrc-mov', name: 'VidSrc.mov (Nested Opaque Embed)', url: 'https://vidsrc.mov/embed/movie/1368337' },
  { id: 'vidapi', name: 'VidAPI (Custom postMessage Bridge)', url: 'https://vaplayer.ru/embed/movie/1368337' },
];

export function UniversalEmbedPlayer({
  initialSrc = '/test-playerjs-embed.html',
  providerId = 'playerjs-reference',
  title,
  subtitle,
  onBack,
}: UniversalEmbedPlayerProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const adapterRef = useRef<PlayerJsAdapter | null>(null);

  const [activeUrl, setActiveUrl] = useState(initialSrc);
  const [activeProvider, setActiveProvider] = useState(providerId);
  const mappedActiveUrl = useMemo(() => mapProviderEmbedUrl(activeUrl), [activeUrl]);
  const [showInspector, setShowInspector] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number>();

  const [playerState, setPlayerState] = useState<EmbedPlayerState>({
    isReady: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
    capabilities: { ...EMPTY_CAPABILITIES },
    lastEvent: null,
    eventLog: [],
    error: null,
  });

  const addLog = useCallback((type: string, details?: unknown) => {
    setPlayerState((prev) => ({
      ...prev,
      lastEvent: type,
      eventLog: [
        { timestamp: Date.now(), type, details },
        ...prev.eventLog.slice(0, 49), // Keep latest 50 logs
      ],
    }));
  }, []);

  const handleEmbedLoad = useCallback(() => {
    const result = remapVidApiNestedPlayerFrame(iframeRef.current, activeUrl);
    if (result.status !== 'not-applicable') {
      addLog(`vidapi:nested-frame:${result.status}`, { originalUrl: result.originalUrl, mappedUrl: result.mappedUrl });
    }
  }, [activeUrl, addLog]);

  // ── Auto-hide UI ───────────────────────────────────────────────────────────
  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 3500);
  }, []);

  // ── Initialize Player.js Adapter & Attach to Iframe ────────────────────────
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Reset state for new source
    setPlayerState({
      isReady: false,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      isMuted: false,
      playbackRate: 1,
      capabilities: { ...EMPTY_CAPABILITIES },
      lastEvent: null,
      eventLog: [{ timestamp: Date.now(), type: 'adapter:init', details: { url: mappedActiveUrl } }],
      error: null,
    });

    const adapter = new PlayerJsAdapter();
    adapterRef.current = adapter;
    adapter.attach(iframe);
    adapter.src = mappedActiveUrl;

    // Direct message listener to inspect all raw window postMessages
    const onRawMessage = (e: MessageEvent) => {
      let data = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { /* ignore */ }
      }
      if (data && typeof data === 'object') {
        if (data.context === 'player.js') {
          addLog(`postMessage:player.js [${data.event || data.method}]`, data);
        } else if (data.type) {
          addLog(`postMessage:custom [${data.type}]`, data);
        }
      }
    };
    window.addEventListener('message', onRawMessage);

    // ── Listen to PlayerJsAdapter Events ─────────────────────────────────────
    const onReady = () => {
      // Perform genuine Player.js feature detection using adapter.supports()
      const caps: EmbedPlayerCapabilities = {
        play: adapter.supports('method', 'play'),
        pause: adapter.supports('method', 'pause'),
        seek: adapter.supports('method', 'setCurrentTime'),
        volume: adapter.supports('method', 'setVolume'),
        mute: adapter.supports('method', 'mute'),
        timeupdate: adapter.supports('event', 'timeupdate'),
        duration: adapter.supports('method', 'getDuration'),
        ended: adapter.supports('event', 'ended'),
        error: adapter.supports('event', 'error'),
        captions: false, // Honest feature detection: Player.js standard defines no text track API
        playbackRate: adapter.supports('method', 'setPlaybackRate'),
      };

      addLog('playerjs:ready', { capabilities: caps });
      setPlayerState((prev) => ({
        ...prev,
        isReady: true,
        capabilities: caps,
        duration: Number.isFinite(adapter.duration) ? adapter.duration : prev.duration,
      }));
    };

    const onPlay = () => {
      addLog('playerjs:play');
      setPlayerState((prev) => ({ ...prev, isPlaying: true }));
    };

    const onPause = () => {
      addLog('playerjs:pause');
      setPlayerState((prev) => ({ ...prev, isPlaying: false }));
    };

    const onTimeUpdate = () => {
      const cur = adapter.currentTime;
      const dur = adapter.duration;
      setPlayerState((prev) => ({
        ...prev,
        currentTime: Number.isFinite(cur) ? cur : prev.currentTime,
        duration: Number.isFinite(dur) && dur > 0 ? dur : prev.duration,
      }));
    };

    const onEnded = () => {
      addLog('playerjs:ended');
      setPlayerState((prev) => ({ ...prev, isPlaying: false }));
    };

    const onError = (err: Event) => {
      addLog('playerjs:error', err);
      setPlayerState((prev) => ({ ...prev, error: 'Playback error reported by embed' }));
    };

    adapter.addEventListener('play', onPlay);
    adapter.addEventListener('pause', onPause);
    adapter.addEventListener('timeupdate', onTimeUpdate);
    adapter.addEventListener('ended', onEnded);
    adapter.addEventListener('error', onError);
    adapter.addEventListener('loadcomplete', onReady);

    return () => {
      window.removeEventListener('message', onRawMessage);
      adapter.removeEventListener('play', onPlay);
      adapter.removeEventListener('pause', onPause);
      adapter.removeEventListener('timeupdate', onTimeUpdate);
      adapter.removeEventListener('ended', onEnded);
      adapter.removeEventListener('error', onError);
      adapter.removeEventListener('loadcomplete', onReady);
      adapter.destroy();
      adapterRef.current = null;
    };
  }, [mappedActiveUrl, addLog]);

  // ── Actions Handlers (Driven by Feature Detection) ─────────────────────────
  const togglePlay = () => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    if (playerState.isPlaying) {
      if (playerState.capabilities.pause) {
        adapter.pause();
      }
    } else {
      if (playerState.capabilities.play) {
        adapter.play().catch(() => {});
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const adapter = adapterRef.current;
    if (!adapter || !playerState.capabilities.seek) return;
    const target = Number(e.target.value);
    adapter.currentTime = target;
    setPlayerState((prev) => ({ ...prev, currentTime: target }));
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const adapter = adapterRef.current;
    if (!adapter || !playerState.capabilities.volume) return;
    const val = Number(e.target.value);
    adapter.volume = val;
    setPlayerState((prev) => ({ ...prev, volume: val, isMuted: val === 0 }));
  };

  const toggleMute = () => {
    const adapter = adapterRef.current;
    if (!adapter || !playerState.capabilities.volume) return;
    const nextMuted = !playerState.isMuted;
    adapter.muted = nextMuted;
    setPlayerState((prev) => ({ ...prev, isMuted: nextMuted }));
  };

  const toggleFullscreen = () => {
    if (!rootRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current.requestFullscreen();
    }
  };

  const currentReport = PROVIDER_COMPATIBILITY_REPORTS[activeProvider] || PROVIDER_COMPATIBILITY_REPORTS.vixsrc;

  return (
    <div
      ref={rootRef}
      onPointerMove={poke}
      className="nexusnight-embed-skin relative fixed inset-0 flex flex-col bg-black text-bone"
    >
      {/* External Iframe Element */}
      <iframe
        ref={iframeRef}
        key={activeUrl}
        src={mappedActiveUrl}
        title={title}
        onLoad={handleEmbedLoad}
        className="nexusnight-embed-frame absolute inset-0 size-full border-0 bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="origin"
      />

      {/* Top Bar Overlay */}
      <div className={`nexusnight-top-bar transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label={t('back')}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/40 backdrop-blur transition hover:bg-white/15"
          >
            <ArrowLeft className="size-5 rtl:-scale-x-100" />
          </button>
          <div>
            <h1 className="font-display text-lg font-bold tracking-wide sm:text-xl">{title}</h1>
            {subtitle && <p className="text-xs text-dust">{subtitle}</p>}
          </div>
        </div>

        {/* Preset Selector & Diagnostic Toggle */}
        <div className="flex items-center gap-2">
          <select
            value={activeUrl}
            onChange={(e) => {
              const selected = TEST_PRESETS.find((p) => p.url === e.target.value);
              if (selected) {
                setActiveUrl(selected.url);
                setActiveProvider(selected.id);
              }
            }}
            aria-label="Embed Provider Presets"
            className="rounded-md border border-white/20 bg-coal/90 px-3 py-1.5 text-xs text-bone backdrop-blur transition hover:border-gilt/60"
          >
            {TEST_PRESETS.map((p) => (
              <option key={p.id} value={p.url}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowInspector((prev) => !prev)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
              showInspector ? 'border-gilt bg-gilt/20 text-gilt' : 'border-white/20 bg-coal/80 text-bone hover:bg-white/10'
            }`}
          >
            {showInspector ? 'Hide Telemetry' : 'Protocol Telemetry'}
          </button>
        </div>
      </div>

      {/* Real-time Capability & Telemetry Inspector Drawer */}
      {showInspector && (
        <div className="absolute end-4 top-20 z-30 w-96 animate-fade rounded-lg border border-white/15 bg-coal/95 p-4 text-xs shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-bold text-bone">Player.js Capability Matrix</span>
            <span
              className={`capability-badge ${
                playerState.isReady ? 'capability-supported' : 'capability-unsupported'
              }`}
            >
              {playerState.isReady ? 'Player.js Handshake OK' : 'No Player.js Detected'}
            </span>
          </div>

          {/* Grid of detected capabilities */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(playerState.capabilities).map(([key, supported]) => (
              <div key={key} className="flex items-center justify-between rounded bg-crypt/60 px-2 py-1">
                <span className="font-mono text-dust">{key}</span>
                <span className={`capability-badge ${supported ? 'capability-supported' : 'capability-unsupported'}`}>
                  {supported ? 'Supported' : 'Unavailable'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-white/10 pt-2 text-dust">
            <p>
              <strong className="text-bone">Provider:</strong> {currentReport.name}
            </p>
            <p className="mt-1">
              <strong className="text-bone">Protocol:</strong>{' '}
              <span className="font-mono text-blood-hot">{currentReport.protocol}</span>
            </p>
            <p className="mt-1 line-clamp-2">
              <strong className="text-bone">SDK Status:</strong>{' '}
              {currentReport.documentedSdk || 'None (Direct cross-origin iframe)'}
            </p>
          </div>

          {/* Event Log Output */}
          <div className="mt-3 border-t border-white/10 pt-2">
            <span className="font-semibold text-bone">Recent Events:</span>
            <div className="mt-1 max-h-28 overflow-y-auto rounded bg-black/60 p-1.5 font-mono text-[10px] text-dust">
              {playerState.eventLog.length === 0 && <span className="opacity-50">Listening for postMessage...</span>}
              {playerState.eventLog.map((log, i) => (
                <div key={i} className="truncate">
                  <span className="text-gilt">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.type}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Outer NEXUSNIGHT Video.js 10 Custom Control Bar */}
      {/* Notice: Controls only render functional handles if the embed implements Player.js */}
      <div className={`nexusnight-controls-bar transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {/* Seek Bar (Enabled only if seek capability is reported) */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={playerState.duration || 100}
            step={0.5}
            value={playerState.currentTime}
            onChange={handleSeek}
            disabled={!playerState.capabilities.seek}
            title={playerState.capabilities.seek ? 'Seek position' : 'Seeking not supported by this embed protocol'}
            className={`h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[var(--color-blood-hot)] transition ${
              playerState.capabilities.seek ? 'bg-white/25 hover:bg-white/40' : 'cursor-not-allowed bg-white/10 opacity-40'
            }`}
          />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              disabled={!playerState.capabilities.play && !playerState.capabilities.pause}
              title={playerState.capabilities.play ? 'Play / Pause' : 'Playback control unsupported via postMessage'}
              className={`flex size-10 items-center justify-center rounded-full transition ${
                playerState.capabilities.play
                  ? 'bg-blood text-white shadow-md hover:bg-blood-hot'
                  : 'cursor-not-allowed bg-white/10 text-dust opacity-50'
              }`}
            >
              {playerState.isPlaying ? <Pause className="size-5" /> : <Play className="size-5 rtl:-scale-x-100" />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 ms-2">
              <button
                onClick={toggleMute}
                disabled={!playerState.capabilities.volume}
                className={`p-1.5 text-bone transition ${playerState.capabilities.volume ? 'hover:text-gilt' : 'opacity-40'}`}
              >
                <Volume level={playerState.isMuted || playerState.volume === 0 ? 0 : playerState.volume < 0.5 ? 1 : 2} className="size-5" />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={playerState.isMuted ? 0 : playerState.volume}
                onChange={handleVolume}
                disabled={!playerState.capabilities.volume}
                title={playerState.capabilities.volume ? 'Volume' : 'Volume control unsupported via postMessage'}
                className="h-1 w-20 appearance-none rounded-full bg-white/20 accent-[var(--color-gilt)] disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>

            {/* Time Indicator */}
            <span className="ms-2 font-mono text-xs tabular-nums text-bone">
              {fmtTime(playerState.currentTime)}{' '}
              <span className="text-dust">/ {playerState.duration > 0 ? fmtTime(playerState.duration) : '--:--'}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Subtitles Button (Honest: Player.js has no textTrack API) */}
            <div className="relative group/sub">
              <button
                disabled
                className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-dust opacity-40 cursor-not-allowed"
                title="Captions unavailable: The Player.js standard defines no subtitle API."
              >
                <Subtitles className="size-4" />
              </button>
              <div className="pointer-events-none absolute bottom-full end-0 mb-2 hidden w-48 rounded bg-coal/95 p-2 text-[10px] text-dust shadow-lg group-hover/sub:block">
                Captions unavailable: The Player.js specification defines no text track interface.
              </div>
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-bone transition hover:bg-white/20"
              title="Toggle Fullscreen"
            >
              <Fullscreen className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
