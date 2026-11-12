import { useEffect, useRef, type RefObject } from 'react';
import type { PlayerHandle } from '../player/Player';
import type { RoomApi } from './RoomContext';
import { decide } from './sync';

/**
 * Keeps ONE player in step with the room's authoritative state:
 *  - applies every state broadcast immediately (play / pause / seek / hold / resume)
 *  - syncs subtitle, audio, and playback rate changes
 *  - every second corrects drift: >1.5s → seek, 0.4–1.5s → gentle playbackRate nudge
 *  - handles the browser's autoplay block (late joiners) via onNeedsGesture
 * Player → room traffic only comes from real user input (never from this hook), so there are no echo loops.
 */
export function useRoomSync(opts: {
  room: RoomApi;
  mediaId: string;
  handle: RefObject<PlayerHandle | null>;
  ready: boolean;
  onNeedsGesture: (needs: boolean) => void;
}) {
  const { room, mediaId, handle, ready, onNeedsGesture } = opts;
  const roomRef = useRef(room);
  roomRef.current = room;
  const gestureCb = useRef(onNeedsGesture);
  gestureCb.current = onNeedsGesture;
  
  // Track last synced values to avoid echo loops
  const lastSyncedRef = useRef({
    subtitleId: null as string | null,
    audioTrack: 0,
    playbackRate: 1,
  });

  useEffect(() => {
    if (!ready || !room.active) return;

    const apply = (cause: 'event' | 'tick') => {
      const r = roomRef.current;
      const s = r.getState();
      const h = handle.current;
      if (!s || !h || s.mediaId !== mediaId) return;
      const d = decide(s, r.serverNow(), h.getTime(), h.getRate(), cause);
      if (d.seekTo !== undefined) h.seek(d.seekTo);
      if (Math.abs(h.getRate() - d.rate) > 0.001) h.setRate(d.rate);
      if (d.play && !h.isPlaying()) h.play().then(() => gestureCb.current(false)).catch(() => gestureCb.current(true));
      else if (!d.play && h.isPlaying()) h.pause();
      
      // Sync subtitle, audio, and playback rate (only on event, not on tick)
      if (cause === 'event') {
        const last = lastSyncedRef.current;
        
        // Sync subtitle if changed
        if (s.subtitleId !== last.subtitleId) {
          h.setSubtitle(s.subtitleId);
          last.subtitleId = s.subtitleId;
        }
        
        // Sync audio track if changed
        if (s.audioTrack !== last.audioTrack) {
          h.setAudioTrack(s.audioTrack);
          last.audioTrack = s.audioTrack;
        }
        
        // Sync playback rate if changed (and not currently nudging for drift correction)
        if (s.playbackRate !== last.playbackRate && d.rate === s.playbackRate) {
          h.setRate(s.playbackRate);
          last.playbackRate = s.playbackRate;
        }
      }
    };

    apply('event');
    const off = room.onState(() => apply('event'));
    const iv = window.setInterval(() => apply('tick'), 1000);
    return () => { off(); window.clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mediaId, room.active]);
}
