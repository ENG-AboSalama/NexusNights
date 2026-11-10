import { useEffect, useRef, useState } from 'react';
import { u } from '../api';
import type { SpriteInfoPublic } from '../api-types';
import { clamp, fmtTime } from '../format';

interface Props {
  time: number;
  duration: number;
  buffered: number;
  sprite: SpriteInfoPublic | null;
  onSeek: (t: number) => void;
  label: string;
}

const SCALE = 1.2;

/** Time axis is always left→right (even in RTL), like every video player. */
export function SeekBar({ time, duration, buffered, sprite, onSeek, label }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    if (sprite) new Image().src = u(sprite.url)!; // warm the cache so the first hover is instant
  }, [sprite]);

  const pos = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    return { x, t: duration > 0 ? (x / r.width) * duration : 0 };
  };

  const shown = drag ?? time;
  const pct = duration > 0 ? clamp((shown / duration) * 100, 0, 100) : 0;
  const bufPct = duration > 0 ? clamp((buffered / duration) * 100, 0, 100) : 0;
  const active = hover !== null || drag !== null;
  const tip = drag !== null && hover === null ? { t: drag, x: (pct / 100) * (track.current?.clientWidth ?? 0) } : hover;

  let preview: JSX.Element | null = null;
  if (tip) {
    const w = (sprite?.tileW ?? 0) * SCALE;
    const tw = track.current?.clientWidth ?? 0;
    const left = clamp(tip.x, Math.max(w / 2, 28) + 4, Math.max(tw - Math.max(w / 2, 28) - 4, 0));
    let tile: JSX.Element | null = null;
    if (sprite) {
      const idx = Math.min(sprite.count - 1, Math.floor(tip.t / sprite.intervalSec));
      const col = idx % sprite.cols;
      const row = Math.floor(idx / sprite.cols);
      tile = (
        <div
          className="rounded-md border border-white/20 bg-black shadow-xl"
          style={{
            width: w,
            height: sprite.tileH * SCALE,
            backgroundImage: `url(${u(sprite.url)})`,
            backgroundSize: `${sprite.cols * w}px ${sprite.rows * sprite.tileH * SCALE}px`,
            backgroundPosition: `-${col * w}px -${row * sprite.tileH * SCALE}px`,
          }}
        />
      );
    }
    preview = (
      <div className="pointer-events-none absolute bottom-full mb-3 flex -translate-x-1/2 flex-col items-center gap-1.5" style={{ left }}>
        {tile}
        <span className="rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums">{fmtTime(tip.t)}</span>
      </div>
    );
  }

  return (
    <div
      dir="ltr"
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      className="group/seek relative flex h-5 w-full cursor-pointer touch-none items-center"
      onPointerMove={(e) => {
        const p = pos(e.clientX);
        setHover(p);
        if (drag !== null) setDrag(p.t);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = pos(e.clientX);
        setDrag(p.t);
        setHover(p);
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        onSeek(pos(e.clientX).t);
        setDrag(null);
        if (e.pointerType !== 'mouse') setHover(null);
      }}
      onPointerCancel={() => setDrag(null)}
    >
      <div className={`relative w-full overflow-visible rounded-full bg-white/20 transition-[height] duration-150 ${active ? 'h-[7px]' : 'h-[3px]'}`}>
        <div className="absolute inset-y-0 start-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
        <div className={`absolute inset-y-0 start-0 rounded-full bg-blood-hot ${drag === null ? 'transition-[width] duration-300 ease-linear' : ''}`} style={{ width: `${pct}%` }} />
        {hover && <div className="absolute inset-y-0 start-0 rounded-full bg-white/25" style={{ width: hover.x }} />}
        <div
          className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gilt shadow-[0_0_0_3px_rgba(10,7,8,0.6)] transition-transform duration-150 ${active ? 'scale-100' : 'scale-0'}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      {preview}
    </div>
  );
}
