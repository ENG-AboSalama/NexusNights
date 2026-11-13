/**
 * Dizibal Provider Constants
 * Turkish streaming site with direct M3U8 sources
 */

export const DIZIBAL_VERSION = '1.0.0';

/**
 * Domain candidates (sites change domains frequently)
 * Health check will verify which one is currently active
 */
export const DOMAIN_CANDIDATES = [
  'https://dizibal.org',
  'https://dizibal.net',
  'https://dizibal.com',
];

/**
 * Standard headers for all requests to Dizibal
 */
export const SITE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Default request timeout in milliseconds
 */
export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Turkish character to ASCII mapping for title normalization
 */
export const TR_ASCII_MAP: Record<string, string> = {
  'ç': 'c', 'Ç': 'c',
  'ğ': 'g', 'Ğ': 'g',
  'ı': 'i', 'İ': 'i',
  'ö': 'o', 'Ö': 'o',
  'ş': 's', 'Ş': 's',
  'ü': 'u', 'Ü': 'u',
  'â': 'a', 'Â': 'a',
  'î': 'i', 'Î': 'i',
  'û': 'u', 'Û': 'u',
};
