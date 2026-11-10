/** Tiny promise pool: at most `max` tasks run at once, the rest wait in FIFO order. */
export class Limiter {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/** Runs `fn` over `items` with bounded concurrency; errors are collected, never thrown. */
export async function mapLimit<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
  onProgress?: (done: number) => void,
): Promise<void> {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        await fn(items[i], i);
      } catch {
        /* callers record their own errors */
      }
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
