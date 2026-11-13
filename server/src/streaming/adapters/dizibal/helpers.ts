/**
 * Dizibal Provider Helper Functions
 */

import { TR_ASCII_MAP, SITE_HEADERS, DEFAULT_TIMEOUT_MS } from './constants';

/**
 * Normalize media type to 'movie' or 'tv'
 */
export function normalizeMediaType(mediaType: string): 'movie' | 'tv' {
  const value = String(mediaType || '').toLowerCase();
  return value === 'tv' || value === 'series' || value === 'show' ? 'tv' : 'movie';
}

/**
 * Normalize Turkish title for comparison
 * - Converts Turkish characters to ASCII
 * - Removes non-alphanumeric characters
 * - Converts to lowercase
 */
export function normalizeTitle(value: string): string {
  return String(value || '')
    .replace(/[çÇğĞıİöÖşŞüÜâÂîÎûÛ]/g, (c) => TR_ASCII_MAP[c] || c)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Extract year from metadata string
 */
export function extractYear(meta: string | undefined): string {
  const match = String(meta || '').match(/(\d{4})/);
  return match ? match[1] : '';
}

/**
 * Extract poster key from TMDB poster path
 * Example: "/w780/abc123.jpg" → "abc123"
 */
export function posterKey(value: string | undefined): string {
  const name = String(value || '').split('/').pop() || '';
  return name.replace(/\.[a-z0-9]+$/i, '');
}

/**
 * Fetch text with timeout and proper headers
 */
export async function fetchText(
  url: string,
  referer?: string,
  accept?: string
): Promise<string> {
  const headers: Record<string, string> = { ...SITE_HEADERS };
  if (accept) headers['Accept'] = accept;
  if (referer) headers['Referer'] = referer;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse player embed from HTML
 * Looks for: <div data-pv="SLUG"> + <script src="https://HOST/assets/js/core.js">
 */
export function parsePlayerEmbed(html: string): { slug: string; host: string } | null {
  if (/data-player-type="none"/i.test(html)) return null;

  const slugMatch = html.match(/data-pv="([^"]+)"/i);
  const loaderMatch = html.match(
    /<script[^>]+src="(https?:\/\/[^"]+?)\/(?:assets\/js\/core|e\/c)\.js[^"]*"/i
  );

  const slug = slugMatch?.[1];
  const loader = loaderMatch?.[1];

  if (!slug || !loader) return null;

  return {
    slug,
    host: loader.replace(/\/+$/, ''),
  };
}

/**
 * Parse player config from s.php response
 * Looks for: window.__PLAYER__ = {...}
 */
export function parsePlayerConfig(html: string): any | null {
  const match = html.match(/window\.__PLAYER__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!match) return null;

  try {
    const config = JSON.parse(match[1]);
    return config && config.stream ? config : null;
  } catch {
    return null;
  }
}

/**
 * Detect HLS quality from master playlist
 * Looks for RESOLUTION tag
 */
export function detectHlsQuality(masterText: string): string | null {
  const resMatch = masterText.match(/RESOLUTION=\d+x(\d+)/);
  if (!resMatch) return null;

  const height = parseInt(resMatch[1], 10);
  if (height >= 2160) return '4K';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';

  return null;
}

/**
 * Extract quality from release name
 * Example: "Game.of.Thrones.S01E01.1080p.WebDL..." → "1080p"
 */
export function qualityFromRelease(name: string | undefined): string | null {
  const match = String(name || '').match(/(2160|1440|1080|720|480)p/i);
  if (!match) return null;
  return match[1] === '2160' ? '4K' : `${match[1]}p`;
}

/**
 * Normalize subtitles from player config
 */
export function normalizeSubtitles(
  subs: any[] | undefined,
  host: string
): Array<{ url: string; lang: string; language: string; label: string; format: string }> {
  return (subs || [])
    .map((sub) => {
      if (!sub || !sub.src) return null;

      const lang = String(sub.lang || '').toLowerCase() || 'und';
      const label = sub.label || lang.toUpperCase();

      return {
        url: sub.src,
        lang,
        language: lang,
        label,
        format: 'vtt',
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    // Turkish subtitles first
    .sort((a, b) => (a.lang === 'tr' ? 0 : 1) - (b.lang === 'tr' ? 0 : 1));
}

/**
 * Generate audio summary for display
 * Example: "Türkçe Dublaj · Orijinal (EN)"
 */
export function audioSummary(audios: any[] | undefined): string {
  const labels = (audios || [])
    .filter((a) => a && a.label)
    .map((a) => {
      if (!/^orijinal/i.test(a.label)) return a.label;
      const lang = String(a.lang || '').toUpperCase();
      return lang && lang !== 'TR' ? `Orijinal (${lang})` : 'Orijinal';
    });

  return labels.join(' · ');
}

/**
 * Build stream headers for playback
 */
export function streamHeaders(host: string): Record<string, string> {
  return {
    'User-Agent': SITE_HEADERS['User-Agent'],
    'Referer': `${host}/`,
    'Origin': host,
  };
}

/**
 * Ensure HLS URL has proper extension hint
 * Adds #.m3u8 if missing
 */
export function ensureHlsExtHint(url: string): string {
  if (url.includes('.m3u8')) return url;
  return url + (url.includes('?') ? '&' : '?') + '#.m3u8';
}
