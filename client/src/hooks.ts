import { useCallback, useEffect, useRef, useState } from 'react';

export interface Async<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

/** Tiny data hook: aborts on unmount/deps change, keeps old data while reloading. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current(ac.signal).then(
      (data) => !ac.signal.aborted && setState({ data, error: null, loading: false }),
      (error: Error) => !ac.signal.aborted && error.name !== 'AbortError' && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export function useScrolled(threshold = 24): boolean {
  const [s, setS] = useState(false);
  useEffect(() => {
    const on = () => setS(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return s;
}
