export const Skel = ({ className = '' }: { className?: string }) => <div className={`skeleton rounded-md ${className}`} />;

export function RowSkeleton({ landscape = true }: { landscape?: boolean }) {
  return (
    <div className="flex gap-3 overflow-hidden px-[var(--pad)]" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <Skel key={i} className={`shrink-0 ${landscape ? 'aspect-video w-[var(--card-w)]' : 'aspect-[2/3] w-[var(--poster-w)]'}`} />
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative h-[min(78dvh,46rem)] min-h-[22rem] w-full" aria-hidden>
      <Skel className="absolute inset-0 rounded-none" />
      <div className="absolute bottom-[12%] start-[var(--pad)] flex w-[min(34rem,80%)] flex-col gap-4">
        <Skel className="h-12 w-3/4" />
        <Skel className="h-4 w-1/2" />
        <Skel className="h-16 w-full" />
        <div className="flex gap-3"><Skel className="h-11 w-32" /><Skel className="h-11 w-36" /></div>
      </div>
    </div>
  );
}
