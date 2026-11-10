import { useRoom } from './RoomContext';

export function Toasts({ inPlayer = false }: { inPlayer?: boolean }) {
  const { toasts } = useRoom();
  if (!toasts.length) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-[70] flex flex-col items-center gap-2 ${inPlayer ? 'top-[max(4.5rem,9cqh)]' : 'fixed top-20'}`}>
      {toasts.map((x) => (
        <div key={x.id} className="max-w-[min(30rem,90%)] animate-rise rounded-full border border-white/10 bg-coal/95 px-4 py-2 text-center text-sm shadow-2xl backdrop-blur-md">{x.text}</div>
      ))}
    </div>
  );
}
