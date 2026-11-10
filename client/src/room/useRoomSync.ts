import { useEffect, useRef, type RefObject } from 'react';
import type { PlayerHandle } from '../player/Player';
import type { RoomApi } from './RoomContext';
import { decide } from './sync';

/**
 * Keeps ONE player in step with the room's authoritative state:
 *  - applies every state broadcast immediately (play / pause / seek / hold / resume)
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
    };

    apply('event');
    const off = room.onState(() => apply('event'));
    const iv = window.setInterval(() => apply('tick'), 1000);
    return () => { off(); window.clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mediaId, room.active]);
}
