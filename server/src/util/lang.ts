const TOKENS: Record<string, string> = {
  en: 'en', eng: 'en', english: 'en',
  ar: 'ar', ara: 'ar', arabic: 'ar', 'العربية': 'ar', 'عربي': 'ar', 'عربى': 'ar',
  fr: 'fr', fre: 'fr', fra: 'fr', french: 'fr',
  es: 'es', spa: 'es', spanish: 'es',
  de: 'de', ger: 'de', deu: 'de', german: 'de',
  it: 'it', ita: 'it', italian: 'it',
  pt: 'pt', por: 'pt', portuguese: 'pt',
  ru: 'ru', rus: 'ru', russian: 'ru',
  tr: 'tr', tur: 'tr', turkish: 'tr',
  ja: 'ja', jpn: 'ja', japanese: 'ja',
  ko: 'ko', kor: 'ko', korean: 'ko',
  zh: 'zh', chi: 'zh', zho: 'zh', chinese: 'zh',
  hi: 'hi', hin: 'hi', hindi: 'hi',
};

export const langFromToken = (t: string): string | undefined => TOKENS[t.toLowerCase()];

/** ISO-639-2 / BCP-47 / free text → 2-letter code, or undefined for "und"/unknown. */
export function normalizeLang(code?: string | null): string | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase().split(/[-_]/)[0];
  if (!c || c === 'und' || c === 'unk') return undefined;
  return TOKENS[c] ?? (c.length === 2 ? c : undefined);
}

const names = new Intl.DisplayNames(['en'], { type: 'language' });
export function langLabel(code?: string): string | undefined {
  if (!code) return undefined;
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
