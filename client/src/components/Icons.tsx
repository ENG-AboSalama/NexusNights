import type { SVGProps as P } from 'react';

const base = (p: P<SVGSVGElement>): P<SVGSVGElement> => ({ width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p });

export const Play = (p: P<SVGSVGElement>) => <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}><path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4A1 1 0 0 0 7 4.6z" /></svg>;
export const Pause = (p: P<SVGSVGElement>) => <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}><rect x="5.5" y="4" width="4.5" height="16" rx="1.2" /><rect x="14" y="4" width="4.5" height="16" rx="1.2" /></svg>;
export const Info = (p: P<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></svg>;
export const ChevronRight = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="m9 5 7 7-7 7" /></svg>;
export const ChevronLeft = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="m15 5-7 7 7 7" /></svg>;
export const ChevronDown = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="m5 9 7 7 7-7" /></svg>;
export const Star = (p: P<SVGSVGElement>) => <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}><path d="m12 2 3 7h7l-5.5 4.5L19 21l-7-5-7 5 2.5-7.5L2 9h7z" /></svg>;
export const ArrowLeft = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14M5 12l6-6M5 12l6 6" /></svg>;
export const Users = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
export const Globe = (p: P<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10zM2 12h20" /></svg>;
export const Volume = ({ level = 2, ...p }: P<SVGSVGElement> & { level?: 0 | 1 | 2 }) => <svg {...base(p)}><path d="M11 5 6 9H2v6h4l5 4z" />{level > 0 && <path d="M15.5 8.5a5 5 0 0 1 0 7" />}{level > 1 && <path d="M18 5.5a9 9 0 0 1 0 13" />}</svg>;
export const Fullscreen = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>;
export const ExitFullscreen = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>;
export const Subtitles = (p: P<SVGSVGElement>) => <svg {...base(p)}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 11h4M14 11h4M6 15h8" /></svg>;
export const AudioTracks = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M9 18V5l12-2v13M9 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></svg>;
export const Gauge = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" /><path d="m9.17 14.83 5.66-5.66" /><circle cx="12" cy="12" r="9" /></svg>;
export const Next = (p: P<SVGSVGElement>) => <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}><path d="M5 4v16l11-8z" /><path d="M19 5v14" /></svg>;
export const Skip = ({ dir, ...p }: P<SVGSVGElement> & { dir: 'fwd' | 'back' }) => <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>{dir === 'fwd' ? <><path d="m2 5 10 7-10 7z" /><path d="m13 5 10 7-10 7z" /></> : <><path d="m22 5-10 7 10 7z" /><path d="m11 5L1 12l10 7z" /></>}</svg>;
export const Spinner = (p: P<SVGSVGElement>) => <svg {...base({ ...p, strokeWidth: 2 })} className={`animate-spin ${p.className ?? ''}`}><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>;
export const Check = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>;
export const X = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const Plus = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const Minus = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14" /></svg>;
export const Heart = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z" /></svg>;
export const ChatBubble = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
export const Send = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="m22 2-7 20-4-9-9-4z" /><path d="m2 2 20 20" /></svg>;
export const Smile = (p: P<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>;
export const Crown = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="m2 8 4 8h12l4-8-5.5 4L12 7 7.5 12z" /></svg>;
export const Hand = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M8 18a6 6 0 0 0 9 5.2 2 2 0 0 0 1-1.7V11a2 2 0 0 0-2-2 2 2 0 0 0-2-2M4 15v3a6 6 0 0 0 6 6" /></svg>;
export const Ban = (p: P<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>;
export const Chat = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
export const Close = X;
export const ExternalLink = (p: P<SVGSVGElement>) => <svg {...base(p)}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="m15 3 6 0 0 6" /><path d="m10 14 11-11" /></svg>;
export const Sigil = (p: P<SVGSVGElement>) => (
  <svg {...base({ ...p, strokeWidth: 2, viewBox: '0 0 32 32' })}>
    <circle cx="16" cy="16" r="14" strokeWidth="1.5" />
    <path d="M16 4 L28 16 L16 28 L4 16 Z" fill="none" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="3" fill="currentColor" stroke="none" />
  </svg>
);
