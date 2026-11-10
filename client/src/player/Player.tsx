import Hls from 'hls.js';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, u } from '../api';
import { mapProviderEmbedUrl, remapVidApiNestedPlayerFrame } from '../util/url-utils';
import type { EpisodeDetail, PlaybackErrorCode, PlaybackConfigPublic, PlaybackSourcePublic } from '../api-types';
import { ArrowLeft, AudioTracks, ExitFullscreen, Fullscreen, Gauge, Next, Pause, Play, Skip, Spinner, Subtitles, Volume } from '../components/Icons';
import { clamp, fmtTime } from '../format';
import { useI18n } from '../i18n';
import { ControlButton, Menu } from './Menu';
import { SeekBar } from './SeekBar';
import { SubtitleOverlay } from './Subtitles';
import { parseVtt, type Cue } from './vtt';

/** Imperative API — Stage 3 drives the player from the server through this (no echo loops:
 *  handle calls never fire the onUser* callbacks, only real user input does). */
export interface PlayerHandle {
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  setRate(r: number): void;
  getRate(): number;
  setAudioTrack(index: number): void;
  setSubtitle(id: string | null): void;
}

interface Props {
  media: EpisodeDetail;
  streamingConfig?: PlaybackConfigPublic | null;
  streamingLoading?: boolean;
  streamingError?: string | null;
  title: string;
  subtitle?: string;
  startAt?: number;
  autoPlay?: boolean;
  /** true → user input only fires onUser* callbacks; the parent applies state via the handle. */
  controlled?: boolean;
  hasNext: boolean;
  onBack: () => void;
  onNext: () => void;
  onEnded?: () => void;
  onProgress?: (t: number, d: number) => void;
  onUserPlay?: (t: number) => void;
  onUserPause?: (t: number) => void;
  onUserSeek?: (t: number) => void;
  /** Room mode: what the room *says* is happening (so a click during a "hold" sends the right intent). */
  intentPlaying?: boolean;
  /** Called once the media is loaded and can start. */
  onReady?: () => void;
  /** Loading (first start) or stalling (network) — the room waits for everybody. */
  onBuffering?: (kind: 'load' | 'stall', value: boolean) => void;
  /** "Waiting for Alice…" pill shown while the room is on hold. */
  holdLabel?: string | null;
  hideSpeed?: boolean;
  /** Rendered inside the player root so it also shows in fullscreen (chat, reactions, toasts). */
  overlay?: ReactNode;
  /** Extra buttons in the control bar (chat, reactions, people). */
  extraControls?: ReactNode;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const num = (k: string, d: number) => { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && localStorage.getItem(k) !== null ? v : d; } catch { return d; } };
const str = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const sleep = (ms: number, s: AbortSignal) => new Promise<void>((res) => { const t = setTimeout(res, ms); s.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });

export const Player = forwardRef<PlayerHandle, Props>(function Player(props, ref) {
  const { media, title, subtitle, startAt = 0, autoPlay = true, controlled = false, hasNext, onBack, onNext, onEnded, onProgress, onUserPlay, onUserPause, onUserSeek, intentPlaying, onReady, onBuffering, holdLabel, hideSpeed, overlay, extraControls } = props;
  const { streamingConfig, streamingLoading, streamingError } = props;
  const { t, lang } = useI18n();

  const rootRef = useRef<HTMLDivElement>(null);
  const embedFrameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const live = useRef(false); // HLS playlist still growing (transcode in progress)
  const startRef = useRef(startAt);
  const cb = useRef({ onProgress, onEnded, onNext, onReady, onBuffering });
  cb.current = { onProgress, onEnded, onNext, onReady, onBuffering };

  // ── streaming failover state ──────────────────────────────────────────────
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [failoverMessage, setFailoverMessage] = useState<string | null>(null);
  const attemptedSources = useRef(new Set<string>());

  const allSources = useMemo(() => {
    if (!streamingConfig) return [];
    return [streamingConfig.source, ...streamingConfig.alternatives].filter(Boolean) as PlaybackSourcePublic[];
  }, [streamingConfig]);
  const currentSource = allSources[currentSourceIndex] || streamingConfig?.source || null;
  const isEmbed = !!currentSource && currentSource.type === 'embed';

  useEffect(() => {
    setCurrentSourceIndex(0);
    attemptedSources.current.clear();
  }, [media.id]);

  const [phase, setPhase] = useState<'preparing' | 'loading' | 'ready' | 'error'>('loading');
  const [errorCode, setErrorCode] = useState<PlaybackErrorCode>('playback_failed');
  const [prep, setPrep] = useState(0);
  const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(startAt);
  const [duration, setDuration] = useState(media.runtimeSec ?? 0);
  const [bufEnd, setBufEnd] = useState(0);
  const [volume, setVolume] = useState(() => clamp(num('umbra:vol', 1), 0, 1));
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [uiVisible, setUiVisible] = useState(true);
  const [menu, setMenu] = useState<null | 'subs' | 'audio' | 'speed'>(null);
  const [fs, setFs] = useState(false);
  const [subId, setSubId] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [audioIdx, setAudioIdx] = useState(0);
  const [flash, setFlash] = useState<{ kind: 'play' | 'pause' | 'back' | 'fwd'; n: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const hideTimer = useRef<number>();
  const clickTimer = useRef<number>();
  const pointerType = useRef('mouse');
  const cueCache = useRef(new Map<string, Cue[]>());
  const flashN = useRef(0);

  // ── helpers ────────────────────────────────────────────────────────────────
  const effDuration = useCallback(() => {
    const v = videoRef.current;
    const apiD = media.runtimeSec ?? 0;
    if (!v) return apiD;
    const vd = v.duration;
    if (live.current || !Number.isFinite(vd) || vd <= 0) return apiD || (Number.isFinite(vd) ? vd : 0);
    return vd;
  }, [media.runtimeSec]);

  const maxSeek = useCallback(() => {
    const v = videoRef.current!;
    return live.current && v.seekable.length ? v.seekable.end(v.seekable.length - 1) : effDuration();
  }, [effDuration]);

  const doFlash = (kind: 'play' | 'pause' | 'back' | 'fwd') => setFlash({ kind, n: ++flashN.current });

  const syncBuffered = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 0.3 && v.buffered.end(i) >= v.currentTime) end = v.buffered.end(i);
    setBufEnd(end);
  }, []);

  // ── source setup (local direct/HLS or streaming) ───────────────────────────
  useEffect(() => {
    const v = videoRef.current!;
    const ac = new AbortController();
    let hls: Hls | null = null;
    let dead = false;
    live.current = false;
    setPhase('loading');
    setErrorCode('playback_failed');
    setPrep(0);
    setDuration(media.runtimeSec ?? 0);
    setFailoverMessage(null);

    const fail = (code: PlaybackErrorCode = 'playback_failed', canFailover = false) => {
      if (dead) return;
      
      // Try automatic failover for streaming sources
      if (canFailover && streamingConfig) {
        const allSources = [streamingConfig.source, ...streamingConfig.alternatives].filter(Boolean) as PlaybackSourcePublic[];
        const tried = attemptedSources.current;
        
        // Prioritize an untried source from a different provider first
        const curSource = allSources[currentSourceIndex];
        const currentProvider = curSource?.provider;
        
        let nextSource = allSources.find(alt => !tried.has(alt.url) && alt.provider !== currentProvider);
        if (!nextSource) {
          nextSource = allSources.find(alt => !tried.has(alt.url));
        }
        
        if (nextSource) {
          tried.add(nextSource.url);
          const nextIdx = allSources.indexOf(nextSource);
          setFailoverMessage('جاري تجهيز مصدر بديل...');
          setCurrentSourceIndex(nextIdx >= 0 ? nextIdx : currentSourceIndex + 1);
          setRetry(prev => prev + 1);
          return;
        }
      }
      
      setErrorCode(code);
      setPhase('error');
    };

    const begin = (isEmbedMode = false) => {
      if (dead) return;
      setPhase('ready');
      setFailoverMessage(null);
      cb.current.onReady?.();
      if (autoPlay && !isEmbedMode) v.play().catch(() => { /* autoplay blocked → user presses play */ });
    };

    (async () => {
      // LOCAL PLAYBACK: direct file
      if (media.playback?.mode === 'direct') {
        v.src = u(`/api/stream/${media.id}`);
        v.addEventListener('loadedmetadata', () => {
          if (startRef.current > 0) v.currentTime = startRef.current;
          begin();
        }, { once: true });
        return;
      }

      // LOCAL PLAYBACK: HLS transcode
      if (media.playback) {
        setPhase('preparing');
        for (;;) {
          const s = await api.hlsStatus(media.id, ac.signal);
          if (dead) return;
          setPrep(s.progress);
          if (s.state === 'error') return fail(s.error ?? 'ffmpeg_failed');
          if (s.canStart) break;
          await sleep(900, ac.signal);
          if (dead) return;
        }
        setPhase('loading');
        const url = u(`/api/hls/${media.id}/master.m3u8`);

        if (Hls.isSupported()) {
          hls = new Hls({ startPosition: startRef.current, maxBufferLength: 40, backBufferLength: 90, enableWorker: true });
          hlsRef.current = hls;
          let net = 0, mediaErr = 0;
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const wanted = str('umbra:audiolang');
            const idx = media.audioTracks.findIndex((a) => a.lang && a.lang === wanted);
            const pick = idx >= 0 ? idx : Math.max(0, media.audioTracks.findIndex((a) => a.default));
            if (hls && hls.audioTracks.length > 1) hls.audioTrack = pick;
            setAudioIdx(pick);
            begin();
          });
          hls.on(Hls.Events.LEVEL_LOADED, (_e, d) => {
            live.current = !!d.details.live;
            setDuration(effDuration());
          });
          hls.on(Hls.Events.ERROR, (_e, d) => {
            if (!d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 4) hls?.startLoad();
            else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaErr++ < 3) hls?.recoverMediaError();
            else fail('playback_failed', false); // Local playback doesn't have alternatives
          });
          hls.loadSource(url);
          hls.attachMedia(v);
        } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = url;
          v.addEventListener('loadedmetadata', () => { if (startRef.current > 0) v.currentTime = startRef.current; begin(); }, { once: true });
        } else return fail();
        return;
      }

      // STREAMING PLAYBACK: wait for streaming config
      if (streamingLoading) {
        setPhase('preparing');
        setPrep(0.3);
        return; // Wait for next effect when streamingConfig arrives
      }

      if (streamingError) {
        return fail('media_not_ready');
      }

      if (!streamingConfig || !streamingConfig.source) {
        return fail(media.playbackError ?? 'media_not_ready');
      }

      // Get current streaming source
      const allSources = [streamingConfig.source, ...streamingConfig.alternatives];
      const source = allSources[currentSourceIndex] || streamingConfig.source;
      if (!source) return fail('media_not_ready');

      // Mark this source as attempted
      attemptedSources.current.add(source.url);

      setPhase('loading');
      const url = source.url;

      // STREAMING: Embed source
      if (source.type === 'embed') {
        api.reportPlaybackSuccess({
          provider: source.provider,
          sourceUrl: source.url,
        }).catch(() => {});
        begin(true);
        return;
      }

      // STREAMING: HLS source
      if (source.type === 'hls' && Hls.isSupported()) {
        hls = new Hls({ startPosition: startRef.current, maxBufferLength: 40, backBufferLength: 90, enableWorker: true });
        hlsRef.current = hls;
        let net = 0, mediaErr = 0, fragParseFails = 0, fragLoadFails = 0;
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // For streaming sources, use embedded audio tracks if available
          if (hls && hls.audioTracks.length > 1) {
            const wanted = str('umbra:audiolang');
            const idx = wanted ? hls.audioTracks.findIndex((t: any) => t.lang === wanted) : -1;
            hls.audioTrack = idx >= 0 ? idx : 0;
          }
          setAudioIdx(0);
          
          // Report success to backend
          api.reportPlaybackSuccess({
            provider: source.provider,
            sourceUrl: source.url,
          }).catch(() => {}); // Silent fail on reporting
          
          begin();
        });
        
        hls.on(Hls.Events.LEVEL_LOADED, (_e, d) => {
          live.current = !!d.details.live;
          setDuration(effDuration());
        });
        
        hls.on(Hls.Events.FRAG_BUFFERED, () => { fragParseFails = 0; fragLoadFails = 0; });

        hls.on(Hls.Events.ERROR, (_e, d) => {
          console.error('[Player] HLS error:', {
            type: d.type,
            details: d.details,
            fatal: d.fatal,
            networkRetries: net,
            mediaRetries: mediaErr,
            response: d.response?.code,
            fragUrl: d.frag?.url,
            reason: d.reason
          });

          // fragLoadError is non-fatal by default in hls.js, but 403 Forbidden or repeated failures
          // mean the stream segments are blocked or invalid. Fail over to an alternative source.
          if (d.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
            const status = d.response?.code || (d.context as any)?.xhr?.status;
            if (status === 403 || ++fragLoadFails >= 2) {
              console.log(`[Player] Fragment load failed (status: ${status}, count: ${fragLoadFails}), failing over`);
              api.reportPlaybackFailure({
                provider: source.provider,
                sourceUrl: source.url,
                failureType: status === 403 ? 'http_403_forbidden' : 'http_timeout',
                responseStatus: status || 0,
                errorDetails: `${d.details} - fragLoadError`,
              }).catch(() => {});
              fail('playback_failed', true);
              return;
            }
          }

          // fragParsingError is flagged non-fatal by hls.js, but it means the segment
          // bytes are unusable. After a few in a row, give up on this source and fail over.
          if (d.details === Hls.ErrorDetails.FRAG_PARSING_ERROR && ++fragParseFails >= 3) {
            console.log('[Player] Repeated fragParsingError, failing over to alternative source');
            fail('playback_failed', true);
            return;
          }
          
          // Report network errors to backend
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && d.response?.code) {
            let failureType: 'cloudflare_challenge' | 'http_403_forbidden' | 'http_404_not_found' | 'http_timeout' = 'http_timeout';
            
            if (d.response.code === 403) {
              const responseText = d.response.text || '';
              if (responseText.includes('Cloudflare') || responseText.includes('cf-ray')) {
                failureType = 'cloudflare_challenge';
              } else {
                failureType = 'http_403_forbidden';
              }
            } else if (d.response.code === 404) {
              failureType = 'http_404_not_found';
            }
            
            api.reportPlaybackFailure({
              provider: source.provider,
              sourceUrl: source.url,
              failureType,
              responseStatus: d.response.code,
              errorDetails: `${d.details} - ${d.fatal ? 'fatal' : 'recoverable'}`,
            }).catch(() => {});
          }
          
          // Report media errors (invalid manifest/corrupted segments)
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.log('[Player] Reporting media error:', d.details);
            api.reportPlaybackFailure({
              provider: source.provider,
              sourceUrl: source.url,
              failureType: 'invalid_manifest',
              responseStatus: 0,
              errorDetails: `${d.details} - ${d.fatal ? 'fatal' : 'recoverable'}`,
            }).catch(() => {});
          }
          
          // Don't proceed with recovery if not fatal
          if (!d.fatal) {
            console.log('[Player] Non-fatal error, ignoring for now');
            return;
          }
          
          // For streaming sources, be more aggressive with failover
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 2) {
            console.log('[Player] Network error, retrying... (attempt', net, 'of 2)');
            hls?.startLoad();
          } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaErr++ < 1) {
            console.log('[Player] Media error, recovering... (attempt', mediaErr, 'of 1)');
            hls?.recoverMediaError();
          } else {
            console.log('[Player] Fatal error limit reached, attempting failover to alternative source');
            fail('playback_failed', true);
          }
        });
        
        hls.loadSource(url);
        hls.attachMedia(v);
      }
      // STREAMING: Native HLS (Safari)
      else if (source.type === 'hls' && v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = url;
        v.addEventListener('loadedmetadata', () => {
          if (startRef.current > 0) v.currentTime = startRef.current;
          begin();
        }, { once: true });
        v.addEventListener('error', () => fail('playback_failed', true), { once: true });
      }
      // STREAMING: Direct MP4
      else if (source.type === 'mp4') {
        v.src = url;
        v.addEventListener('loadedmetadata', () => {
          if (startRef.current > 0) v.currentTime = startRef.current;
          begin();
        }, { once: true });
        v.addEventListener('error', () => fail('playback_failed', true), { once: true });
      }
      else {
        return fail('playback_failed', true);
      }
    })().catch(() => fail('playback_failed', true));

    return () => {
      dead = true;
      ac.abort();
      hls?.destroy();
      hlsRef.current = null;
      v.removeAttribute('src');
      v.load();
    };
  }, [media.id, media.playback, media.audioTracks, media.runtimeSec, autoPlay, retry, effDuration, streamingConfig, streamingLoading, streamingError, currentSourceIndex, t]);

  // ── <video> events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current!;
    const on = <K extends keyof HTMLMediaElementEventMap>(n: K, f: () => void) => { v.addEventListener(n, f); return () => v.removeEventListener(n, f); };
    const offs = [
      on('timeupdate', () => { setTime(v.currentTime); syncBuffered(); }),
      on('progress', syncBuffered),
      on('play', () => setPlaying(true)),
      on('pause', () => { setPlaying(false); cb.current.onProgress?.(v.currentTime, effDuration()); }),
      on('waiting', () => setBuffering(true)),
      on('playing', () => { setBuffering(false); setPlaying(true); }),
      on('canplay', () => setBuffering(false)),
      on('seeked', () => { setBuffering(false); setTime(v.currentTime); }),
      on('volumechange', () => { setVolume(v.volume); setMuted(v.muted); }),
      on('ratechange', () => setRate(v.playbackRate)),
      on('durationchange', () => setDuration(effDuration())),
      on('error', () => { if (v.getAttribute('src')) setPhase('error'); }),
      on('ended', () => {
        setPlaying(false);
        cb.current.onProgress?.(effDuration(), effDuration());
        cb.current.onEnded?.();
        if (hasNext) setCountdown(8);
      }),
    ];
    v.volume = volume;
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id, hasNext]);

  // periodic progress save
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) cb.current.onProgress?.(v.currentTime, effDuration());
    }, 5000);
    return () => {
      clearInterval(id);
      const v = videoRef.current;
      if (v && v.currentTime > 0) cb.current.onProgress?.(v.currentTime, effDuration());
    };
  }, [media.id, effDuration]);

  // next-episode countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); cb.current.onNext(); return; }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);
  useEffect(() => { if (playing) setCountdown(null); }, [playing]);

  // ── subtitles (merge local + streaming) ───────────────────────────────────
  const allSubtitles = useMemo(() => {
    const local = media.subtitles;
    if (!streamingConfig || !streamingConfig.subtitles.length) return local;
    
    // Add streaming subtitles with unique IDs
    const streaming = streamingConfig.subtitles.map((sub, i) => ({
      id: `stream-${i}`,
      lang: sub.language,
      label: sub.label || sub.language,
      source: 'external' as const,
      forced: false,
      url: sub.url,
    }));
    
    return [...local, ...streaming];
  }, [media.subtitles, streamingConfig]);

  const selectSubtitle = useCallback(async (id: string | null) => {
    setSubId(id);
    setMenu(null);
    const tr = allSubtitles.find((s: any) => s.id === id);
    put('umbra:sublang', tr?.lang ?? (id ? '' : 'off'));
    if (!tr) return setCues(null);
    const hit = cueCache.current.get(tr.url);
    if (hit) return setCues(hit);
    try {
      const r = await fetch(tr.url.startsWith('http') ? tr.url : u(tr.url));
      if (!r.ok) throw new Error(String(r.status));
      const parsed = parseVtt(await r.text());
      cueCache.current.set(tr.url, parsed);
      setCues(parsed);
    } catch (err) {
      console.error('[Player] Subtitle load failed:', err);
      setCues(null);
    }
  }, [allSubtitles]);

  useEffect(() => {
    // restore last language choice when the next episode loads
    const pref = str('umbra:sublang');
    const match = pref && pref !== 'off' ? allSubtitles.find((s: any) => s.lang === pref && !s.forced) : undefined;
    void selectSubtitle(match?.id ?? null);
  }, [media.id, selectSubtitle]);

  const selectAudio = useCallback((i: number) => {
    setAudioIdx(i);
    setMenu(null);
    const hls = hlsRef.current;
    if (hls && hls.audioTracks.length > 1) hls.audioTrack = i;
    const l = media.audioTracks[i]?.lang;
    if (l) put('umbra:audiolang', l);
  }, [media.audioTracks]);

  // ── tell the room when we are loading / stalling ─────────────────────────────
  useEffect(() => {
    const loading = phase === 'preparing' || phase === 'loading';
    const t1 = loading ? window.setTimeout(() => cb.current.onBuffering?.('load', true), 400) : undefined;
    if (!loading) cb.current.onBuffering?.('load', false);
    return () => window.clearTimeout(t1);
  }, [phase, media.id]);
  useEffect(() => {
    const stalled = phase === 'ready' && buffering && playing;
    const t1 = stalled ? window.setTimeout(() => cb.current.onBuffering?.('stall', true), 700) : undefined;
    if (!stalled) cb.current.onBuffering?.('stall', false);
    return () => window.clearTimeout(t1);
  }, [phase, buffering, playing, media.id]);

  // ── actions (user input → callbacks; handle → no callbacks) ────────────────
  const seekTo = useCallback((tt: number) => {
    const v = videoRef.current!;
    const x = clamp(tt, 0, Math.max(0, maxSeek()));
    v.currentTime = x;
    setTime(x);
  }, [maxSeek]);

  const userPlay = () => { const v = videoRef.current!; if (!controlled) v.play().catch(() => {}); onUserPlay?.(v.currentTime); doFlash('play'); };
  const userPause = () => { const v = videoRef.current!; if (!controlled) v.pause(); onUserPause?.(v.currentTime); doFlash('pause'); };
  const togglePlay = () => ((intentPlaying ?? !videoRef.current!.paused) ? userPause() : userPlay());
  const userSeek = (tt: number) => {
    const x = clamp(tt, 0, Math.max(0, maxSeek()));
    if (!controlled) seekTo(x);
    onUserSeek?.(x);
  };
  const skip = (d: number) => { userSeek(videoRef.current!.currentTime + d); doFlash(d < 0 ? 'back' : 'fwd'); };

  // Listen for official postMessage events from external providers (e.g. VidAPI STORAGE_SET bridge)
  useEffect(() => {
    if (!isEmbed || phase !== 'ready') return;

    const onMessage = (event: MessageEvent) => {
      try {
        const d = event.data;
        if (!d || typeof d !== 'object') return;

        // VidAPI postMessage bridge: { type: 'STORAGE_SET', key: string, value: any }
        if (d.type === 'STORAGE_SET' && typeof d.key === 'string') {
          if (d.key.startsWith('watch_') || d.key === 'player') {
            let val = d.value;
            if (typeof val === 'string') {
              try { val = JSON.parse(val); } catch { /* plain string/num */ }
            }
            if (val && typeof val === 'object') {
              const pos = Number(val.time ?? val.t ?? val.currentTime);
              const dur = Number(val.duration ?? val.d ?? val.totalDuration) || effDuration();
              if (Number.isFinite(pos) && pos > 0) {
                cb.current.onProgress?.(pos, dur);
              }
            } else if (Number.isFinite(Number(val))) {
              const pos = Number(val);
              if (pos > 0) cb.current.onProgress?.(pos, effDuration());
            }
          }
        }
      } catch {
        /* Ignore third-party postMessage errors */
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isEmbed, phase, effDuration]);

  const triggerNextSource = useCallback(() => {
    if (!streamingConfig) return;
    const all = [streamingConfig.source, ...streamingConfig.alternatives].filter(Boolean) as PlaybackSourcePublic[];
    if (all.length <= 1) return;

    if (currentSource) {
      attemptedSources.current.add(currentSource.url);
      api.reportPlaybackFailure({
        provider: currentSource.provider,
        sourceUrl: currentSource.url,
        failureType: 'http_timeout',
        responseStatus: 0,
        errorDetails: 'User switched to alternative source',
      }).catch(() => {});
    }

    const tried = attemptedSources.current;
    const currentProvider = currentSource?.provider;
    let next = all.find(s => !tried.has(s.url) && s.provider !== currentProvider);
    if (!next) next = all.find(s => !tried.has(s.url));
    if (!next) {
      tried.clear();
      if (currentSource) tried.add(currentSource.url);
      next = all.find(s => s.url !== currentSource?.url) || all[0];
    }

    if (next) {
      tried.add(next.url);
      const nextIdx = all.indexOf(next);
      setFailoverMessage('جاري تجهيز مصدر بديل...');
      setCurrentSourceIndex(nextIdx >= 0 ? nextIdx : 0);
      setRetry(r => r + 1);
    }
  }, [streamingConfig, currentSource]);

  useImperativeHandle(ref, () => ({
    play: async () => { if (!isEmbed && videoRef.current) await videoRef.current.play(); },
    pause: () => { if (!isEmbed && videoRef.current) videoRef.current.pause(); },
    seek: (tt) => {
      if (!isEmbed) seekTo(tt);
    },
    getTime: () => (isEmbed ? startAt : (videoRef.current?.currentTime ?? 0)),
    isPlaying: () => (isEmbed ? phase === 'ready' : !videoRef.current?.paused),
    setRate: (r) => { if (videoRef.current) videoRef.current.playbackRate = r; },
    getRate: () => (videoRef.current?.playbackRate ?? 1),
    setAudioTrack: selectAudio,
    setSubtitle: (id) => void selectSubtitle(id),
  }), [seekTo, selectAudio, selectSubtitle, isEmbed, phase]);

  const setVol = (x: number) => {
    const v = videoRef.current!;
    v.volume = clamp(x, 0, 1);
    v.muted = x <= 0;
    put('umbra:vol', String(v.volume));
  };
  const toggleMute = () => { const v = videoRef.current!; v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; };

  const toggleFs = useCallback(() => {
    const el = rootRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else (el.requestFullscreen?.() ?? Promise.reject()).catch(() => el.webkitRequestFullscreen?.());
  }, []);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // ── auto-hiding controls ───────────────────────────────────────────────────
  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 3200);
  }, []);
  useEffect(() => {
    if (!playing || menu) { window.clearTimeout(hideTimer.current); setUiVisible(true); }
    else poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [playing, menu, poke]);

  // ── keyboard ───────────────────────────────────────────────────────────────
  // The listener is registered rarely; it must always call the LATEST actions (their closures
  // depend on room permissions / state), otherwise a guest who was just granted control keeps
  // hitting the stale "not allowed" version.
  const act = useRef({ togglePlay, skip, setVol, toggleMute });
  act.current = { togglePlay, skip, setVol, toggleMute };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const v = videoRef.current!;
      const k = e.key.toLowerCase();
      let handled = true;
      if (k === ' ' || k === 'k') act.current.togglePlay();
      else if (k === 'arrowleft' || k === 'j') act.current.skip(-10);
      else if (k === 'arrowright' || k === 'l') act.current.skip(10);
      else if (k === 'arrowup') act.current.setVol(v.volume + 0.1);
      else if (k === 'arrowdown') act.current.setVol(v.volume - 0.1);
      else if (k === 'm') act.current.toggleMute();
      else if (k === 'f') toggleFs();
      else if (k === 'n' && hasNext) cb.current.onNext();
      else if (k === 'c' && allSubtitles.length) void selectSubtitle(subId ? null : allSubtitles[0].id);
      else if (k === 'escape' && menu) setMenu(null);
      else handled = false;
      if (handled) { e.preventDefault(); poke(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, hasNext, menu, subId, allSubtitles, toggleFs, poke, selectSubtitle]);

  // ── surface gestures: click = play/pause (tap = toggle UI on touch), double-click = skip/fullscreen ──
  const onSurfaceClick = () => {
    if (menu) return setMenu(null);
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      if (pointerType.current === 'touch') setUiVisible((x) => (x && playing ? false : true));
      else togglePlay();
    }, 230);
  };
  const onSurfaceDouble = (e: React.MouseEvent<HTMLDivElement>) => {
    window.clearTimeout(clickTimer.current);
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.3) skip(-10);
    else if (x > 0.7) skip(10);
    else toggleFs();
  };

  // ── render ─────────────────────────────────────────────────────────────────
  const embedSrc = useMemo(() => {
    if (!isEmbed || !currentSource) return undefined;
    const rawUrl = startAt > 10 && !currentSource.url.includes('#t=') && !currentSource.url.includes('?t=')
      ? `${currentSource.url}${currentSource.url.includes('?') ? '&' : '?'}t=${Math.floor(startAt)}#t=${Math.floor(startAt)}`
      : currentSource.url;
    return mapProviderEmbedUrl(rawUrl);
  }, [isEmbed, currentSource?.url, startAt]);

  const handleEmbedLoad = useCallback(() => {
    if (!currentSource) return;
    const result = remapVidApiNestedPlayerFrame(embedFrameRef.current, currentSource.url);
    if (result.status !== 'not-applicable') {
      console.info('[Player] VidAPI nested-frame mapping result:', result.status, result.mappedUrl ?? result.originalUrl ?? '');
    }
  }, [currentSource?.url]);

  const volLevel: 0 | 1 | 2 = muted || volume === 0 ? 0 : volume < 0.5 ? 1 : 2;
  const showUi = isEmbed ? uiVisible : (uiVisible || !playing || phase !== 'ready');
  const multiAudio = media.audioTracks.length > 1 && media.playback?.mode === 'hls';
  const iconFlip = 'rtl:-scale-x-100';
  const errorHint = errorCode === 'media_not_ready' ? 'mediaNotReady'
    : errorCode === 'media_tools_missing' ? 'mediaToolsMissing'
      : errorCode === 'media_probe_failed' ? 'mediaProbeFailed'
        : errorCode === 'ffmpeg_missing' ? 'ffmpegMissing'
          : errorCode === 'ffmpeg_failed' ? 'ffmpegFailed'
            : 'playbackErrorHint';

  return (
    <div
      ref={rootRef}
      onPointerMove={poke}
      onPointerDown={(e) => { pointerType.current = e.pointerType; poke(); }}
      className={`@container fixed inset-0 select-none overflow-hidden bg-black text-bone ${!showUi ? 'cursor-none' : ''}`}
    >
      {isEmbed && currentSource && (
        <iframe
          ref={embedFrameRef}
          key={currentSource.url}
          src={embedSrc}
          title={title}
          className="absolute inset-0 size-full border-0 bg-black z-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="origin"
          onLoad={handleEmbedLoad}
          onError={() => {
            console.error('[Player] Iframe load error, attempting failover');
            triggerNextSource();
          }}
        />
      )}
      <video ref={videoRef} playsInline preload="auto" poster={u(media.stillUrl)} className={isEmbed ? 'hidden' : 'absolute inset-0 size-full bg-black object-contain'} />

      {/* gesture surface */}
      {!isEmbed && <div className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={onSurfaceDouble} />}

      {!isEmbed && <SubtitleOverlay video={videoRef.current} cues={cues} raised={showUi} />}

      {/* top bar */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 bg-gradient-to-b from-black/85 to-transparent px-[max(1rem,2.5cqw)] pb-10 pt-[max(0.75rem,2cqh)] transition-opacity duration-300 ${showUi ? 'opacity-100' : 'opacity-0'}`}>
        <button onClick={onBack} aria-label={t('back')} className={`pointer-events-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/30 backdrop-blur transition hover:bg-white/15 active:scale-90 ${showUi ? '' : 'invisible'}`}>
          <ArrowLeft className={`size-5 ${iconFlip}`} />
        </button>
        <div className="min-w-0 pt-0.5">
          <p className="truncate font-display text-[clamp(1rem,2.4cqw,1.5rem)] font-bold tracking-wide">{title}</p>
          {subtitle && <p className="truncate text-[clamp(0.75rem,1.5cqw,0.95rem)] text-dust">{subtitle}</p>}
        </div>
        {isEmbed && currentSource && (
          <div className="pointer-events-auto ms-auto flex items-center gap-2">
            {startAt > 10 && (
              <span
                className="rounded-full border border-gilt/40 bg-black/60 px-2.5 py-1 text-xs font-mono text-gilt"
                title={lang === 'ar' ? 'موضع التوقف المحفوظ' : 'Saved resume position'}
              >
                {lang === 'ar' ? `الموضع السابق: ${fmtTime(startAt)}` : `Resume: ${fmtTime(startAt)}`}
              </span>
            )}
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-dust">
              {currentSource.provider}
            </span>
            {allSources.length > 1 && (
              <button
                onClick={triggerNextSource}
                title={lang === 'ar' ? 'تبديل إلى مصدر بديل' : 'Switch to alternative source'}
                className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs text-bone transition hover:border-gilt/60 hover:bg-white/10"
              >
                {lang === 'ar' ? 'مصدر بديل' : 'Alternative Source'}
              </button>
            )}
            {hasNext && (
              <button
                onClick={onNext}
                title={t('nextEpisode')}
                className="inline-flex items-center gap-1.5 rounded-full bg-blood px-3 py-1 text-xs font-semibold text-bone transition hover:bg-blood-hot"
              >
                <span>{t('nextEpisode')}</span>
                <Next className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* center indicators */}
      {!isEmbed && flash && (
        <div key={flash.n} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" onAnimationEnd={() => setFlash(null)}>
          <div className="flex size-20 animate-pop items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
            {flash.kind === 'play' && <Play className={`size-9 ${iconFlip}`} />}
            {flash.kind === 'pause' && <Pause className="size-9" />}
            {flash.kind === 'back' && <Skip dir="back" className="size-10" />}
            {flash.kind === 'fwd' && <Skip dir="fwd" className="size-10" />}
          </div>
        </div>
      )}
      {!isEmbed && phase === 'ready' && !playing && !buffering && !flash && (
        <button onClick={togglePlay} aria-label={t('play')} className="absolute left-1/2 top-1/2 z-10 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 backdrop-blur-md transition hover:scale-105 hover:border-gilt/70 active:scale-95">
          <Play className={`size-9 ${iconFlip}`} />
        </button>
      )}
      {!isEmbed && phase === 'ready' && buffering && playing && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><Spinner className="size-14 text-bone/90" /></div>
      )}

      {/* preparing / error */}
      {(phase === 'preparing' || phase === 'loading') && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center backdrop-blur-[2px]">
          <Spinner className="size-12 text-gilt" />
          <p className="font-display text-lg tracking-wide">{failoverMessage || t('preparing')}</p>
          {phase === 'preparing' && !failoverMessage && (
            <>
              <div className="h-1 w-56 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-blood-hot transition-[width] duration-700" style={{ width: `${Math.max(4, prep * 100)}%` }} /></div>
              <p className="max-w-sm text-sm text-dust">{t('preparingHint')}</p>
            </>
          )}
        </div>
      )}
      {phase === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
          <p className="font-display text-2xl">{t('playbackError')}</p>
          <p className="max-w-sm text-sm text-dust">{t(errorHint)}</p>
          <div className="mt-2 flex gap-3">
            <button onClick={() => setRetry((r) => r + 1)} className="rounded-md bg-blood px-5 py-2.5 font-semibold transition hover:bg-blood-hot">{t('retry')}</button>
            <button onClick={onBack} className="rounded-md border border-white/20 px-5 py-2.5 transition hover:bg-white/10">{t('back')}</button>
          </div>
        </div>
      )}

      {holdLabel && (
        <div className="pointer-events-none absolute inset-x-0 top-[max(4.5rem,9cqh)] z-20 flex justify-center">
          <div className="flex animate-fade items-center gap-2.5 rounded-full border border-gilt/30 bg-coal/90 px-4 py-2 text-sm shadow-xl backdrop-blur-md">
            <Spinner className="size-4 text-gilt" />
            <span>{holdLabel}</span>
          </div>
        </div>
      )}

      {/* up next */}
      {countdown !== null && !menu && (
        <div className="absolute bottom-28 end-[max(1rem,2.5cqw)] z-30 w-72 animate-rise rounded-xl border border-white/10 bg-coal/95 p-4 shadow-2xl backdrop-blur-xl">
          <p className="text-sm text-dust">{t('nextIn', { n: countdown })}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setCountdown(null); onNext(); }} className="flex-1 rounded-md bg-blood py-2 text-sm font-semibold transition hover:bg-blood-hot">{t('playNow')}</button>
            <button onClick={() => setCountdown(null)} className="rounded-md border border-white/15 px-4 py-2 text-sm transition hover:bg-white/10">{t('cancel')}</button>
          </div>
        </div>
      )}

      {/* bottom controls */}
      {!isEmbed && (
        <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-[max(1rem,2.5cqw)] pb-[max(0.75rem,2cqh)] pt-14 transition-opacity duration-300 ${showUi ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <SeekBar time={time} duration={duration} buffered={bufEnd} sprite={media.sprite} onSeek={userSeek} label="Seek" />
          <div className="mt-1 flex items-center gap-1" dir="ltr">
            <ControlButton label={playing ? t('pause') : t('play')} onClick={togglePlay}>
              {playing ? <Pause className="size-6" /> : <Play className="size-6" />}
            </ControlButton>
            <ControlButton label={t('skipBack')} onClick={() => skip(-10)} className="@max-md:hidden"><Skip dir="back" className="size-6" /></ControlButton>
            <ControlButton label={t('skipForward')} onClick={() => skip(10)} className="@max-md:hidden"><Skip dir="fwd" className="size-6" /></ControlButton>

            <div className="group/vol flex items-center">
              <ControlButton label={muted ? t('unmute') : t('mute')} onClick={toggleMute}><Volume level={volLevel} className="size-6" /></ControlButton>
              <input
                type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} aria-label="Volume"
                onChange={(e) => setVol(Number(e.target.value))} onClick={(e) => e.stopPropagation()}
                className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 accent-[var(--color-gilt)] opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 group-hover/vol:me-2 focus-visible:w-20 focus-visible:opacity-100 @max-sm:hidden"
              />
            </div>

            <span className="ms-1 whitespace-nowrap text-[0.82rem] tabular-nums text-bone/90 @max-sm:text-xs">{fmtTime(time)} <span className="text-dust">/ {fmtTime(duration)}</span></span>

            <div className="ms-auto flex items-center gap-0.5">
              {extraControls}
              {hasNext && (
                <ControlButton label={t('nextEpisode')} onClick={onNext}><Next className="size-6" /></ControlButton>
              )}
              {!hideSpeed && <div className="relative">
                <ControlButton label={t('speed')} active={menu === 'speed'} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} className="@max-sm:hidden">
                  <Gauge className="size-6" />
                </ControlButton>
                {menu === 'speed' && (
                  <Menu title={t('speed')} selected={String(rate)} onSelect={(id) => { videoRef.current!.playbackRate = Number(id); setMenu(null); }}
                    items={RATES.map((r) => ({ id: String(r), label: r === 1 ? t('normal') : `${r}×` }))} />
                )}
              </div>}
              {multiAudio && (
                <div className="relative">
                  <ControlButton label={t('audio')} active={menu === 'audio'} onClick={() => setMenu(menu === 'audio' ? null : 'audio')}><AudioTracks className="size-6" /></ControlButton>
                  {menu === 'audio' && (
                    <Menu title={t('audio')} selected={String(audioIdx)} onSelect={(id) => selectAudio(Number(id))}
                      items={media.audioTracks.map((a) => ({ id: String(a.index), label: a.label, hint: a.channels && a.channels > 2 ? `${a.channels}.0` : undefined }))} />
                  )}
                </div>
              )}
              {allSubtitles.length > 0 && (
                <div className="relative">
                  <ControlButton label={t('subtitles')} active={menu === 'subs' || !!subId} onClick={() => setMenu(menu === 'subs' ? null : 'subs')}><Subtitles className="size-6" /></ControlButton>
                  {menu === 'subs' && (
                    <Menu title={t('subtitles')} selected={subId ?? 'off'} onSelect={(id) => void selectSubtitle(id === 'off' ? null : id)}
                      items={[{ id: 'off', label: t('off') }, ...allSubtitles.map((s: any) => ({ id: s.id, label: s.label }))]} />
                  )}
                </div>
              )}
              <ControlButton label={fs ? t('exitFullscreen') : t('fullscreen')} onClick={toggleFs}>
                {fs ? <ExitFullscreen className="size-6" /> : <Fullscreen className="size-6" />}
              </ControlButton>
            </div>
          </div>
        </div>
      )}
      {overlay}
    </div>
  );
});
