import type { Dict } from './i18n';

type T = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/** Player timecode — always Latin digits, like every video player. */
export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** "58 min" / "1h 48m" (localised). */
export function fmtRuntime(sec: number | null, t: T): string | null {
  if (!sec) return null;
  const min = Math.round(sec / 60);
  if (min < 60) return t('minutes', { n: Math.max(1, min) });
  return t('hoursMinutes', { h: Math.floor(min / 60), m: min % 60 });
}

export function fmtCount(n: number, one: keyof Dict, many: keyof Dict, t: T): string {
  return n === 1 ? t(one) : t(many, { n });
}

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
