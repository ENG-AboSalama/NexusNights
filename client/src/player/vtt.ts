export interface Cue { start: number; end: number; text: string /* sanitised HTML: only <i> <b> <u> <br> */ }

const TS = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
function ts(s: string): number {
  const m = TS.exec(s);
  if (!m) return NaN;
  return (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3] + Number('0.' + m[4]);
}

/** Keeps only <i>/<b>/<u>; everything else (font, ASS overrides, positioning, any HTML) is dropped. */
function clean(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<(?!\/?(?:i|b|u)>)[^>]*>/gi, '')
    .replace(/&(?!(?:amp|lt|gt|quot|nbsp|#\d+);)/g, '&amp;')
    .replace(/\n/g, '<br>');
}

export function parseVtt(src: string): Cue[] {
  const lines = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('-->')) continue;
    const [a, b] = lines[i].split('-->');
    const start = ts(a);
    const end = ts((b ?? '').trim().split(/\s+/)[0]);
    const buf: string[] = [];
    while (i + 1 < lines.length && lines[i + 1].trim() !== '') buf.push(lines[++i]);
    if (!Number.isNaN(start) && !Number.isNaN(end) && buf.length) cues.push({ start, end, text: clean(buf.join('\n')) });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** All cues visible at time t (handles overlapping cues). */
export function activeHtml(cues: Cue[], t: number): string {
  let lo = 0, hi = cues.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const out: string[] = [];
  for (let i = idx; i >= 0 && i > idx - 6; i--) if (cues[i].end > t) out.unshift(cues[i].text);
  return out.join('<br>');
}
