import type { ReactNode } from 'react';
import { Check } from '../components/Icons';

export interface MenuItem { id: string; label: string; hint?: string }

export function ControlButton({ label, onClick, children, active = false, className = '' }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`inline-flex size-10 items-center justify-center rounded-full transition-all duration-200 hover:bg-white/15 active:scale-90 ${active ? 'bg-white/15 text-gilt' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/** Popover that opens above its control button; items show a check next to the selection. */
export function Menu({ title, items, selected, onSelect }: { title: string; items: MenuItem[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-[calc(100%+0.75rem)] end-0 z-30 max-h-[min(18rem,50cqh)] min-w-[12.5rem] max-w-[min(20rem,80cqw)] animate-fade overflow-y-auto rounded-xl border border-white/10 bg-coal/95 p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.9)] backdrop-blur-xl"
    >
      <p className="px-3 pb-1.5 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gilt">{title}</p>
      {items.map((it) => (
        <button
          key={it.id}
          role="menuitemradio"
          aria-checked={it.id === selected}
          onClick={() => onSelect(it.id)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-white/10 ${it.id === selected ? 'text-bone' : 'text-dust'}`}
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-gilt">{it.id === selected && <Check className="size-4" />}</span>
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
          {it.hint && <span className="text-xs text-dust/70">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}
