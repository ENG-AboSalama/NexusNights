import { useEffect, useState } from 'react';
import { activeHtml, type Cue } from './vtt';

/**
 * Subtitles are rendered by us (not the browser's native <track>) so they: work inside our
 * fullscreen container, auto-flip for Arabic/RTL (dir="auto"), and move above the controls.
 */
export function SubtitleOverlay({ video, cues, raised }: { video: HTMLVideoElement | null; cues: Cue[] | null; raised: boolean }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!video || !cues) { setHtml(''); return; }
    let raf = 0;
    let last = '';
    const tick = () => {
      const h = activeHtml(cues, video.currentTime);
      if (h !== last) { last = h; setHtml(h); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, cues]);

  if (!html) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center px-[5%] transition-[bottom] duration-300 ease-out ${raised ? 'bottom-[7.5rem]' : 'bottom-[7%]'}`}>
      <div
        dir="auto"
        className="cue max-w-[min(56rem,100%)] rounded-md bg-black/40 px-3.5 py-1 text-center text-[clamp(1rem,2.7cqw,2rem)] font-medium leading-snug text-white"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
