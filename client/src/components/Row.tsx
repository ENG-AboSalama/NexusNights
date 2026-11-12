import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { ChevronLeft, ChevronRight } from './Icons';

/** Horizontal scroller with snap, edge arrows and RTL-correct scrolling. */
export const Row = memo(function Row({ title, children }: { title: string; children: ReactNode }) {
  const { dir } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = Math.abs(el.scrollLeft); // RTL scrollLeft is negative in Chromium
    setEdge({ start: pos < 6, end: pos + el.clientWidth >= el.scrollWidth - 6 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const scroll = (forward: boolean) => {
    const el = ref.current;
    if (!el) return;
    const sign = (forward ? 1 : -1) * (dir === 'rtl' ? -1 : 1);
    el.scrollBy({ left: sign * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className="group/row relative py-3 sm:py-4">
      <h2 className="mb-2.5 px-[var(--pad)] font-display text-[1.05rem] font-semibold tracking-[0.12em] text-bone/95 sm:text-[1.2rem]">{title}</h2>
      <div className="relative">
        <div
          ref={ref}
          onScroll={measure}
          className="no-scrollbar flex snap-x snap-proximity gap-3 overflow-x-auto scroll-smooth px-[var(--pad)] py-2 [scroll-padding-inline:var(--pad)]"
        >
          {children}
        </div>
        {!edge.start && <Arrow side="start" onClick={() => scroll(false)} />}
        {!edge.end && <Arrow side="end" onClick={() => scroll(true)} />}
      </div>
    </section>
  );
});

function Arrow({ side, onClick }: { side: 'start' | 'end'; onClick: () => void }) {
  const { lang } = useI18n();
  const Icon = side === 'start' ? ChevronLeft : ChevronRight;
  const label = side === 'start' 
    ? (lang === 'ar' ? 'السابق' : 'Previous') 
    : (lang === 'ar' ? 'التالي' : 'Next');
  
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`absolute inset-y-2 z-10 hidden w-12 items-center justify-center opacity-0 transition-opacity duration-300 group-hover/row:opacity-100 sm:flex ${
        side === 'start' ? 'start-0 bg-gradient-to-r from-ink/90 to-transparent rtl:bg-gradient-to-l' : 'end-0 bg-gradient-to-l from-ink/90 to-transparent rtl:bg-gradient-to-r'
      }`}
    >
      <Icon className="size-8 rtl:-scale-x-100" aria-hidden="true" />
    </button>
  );
}
