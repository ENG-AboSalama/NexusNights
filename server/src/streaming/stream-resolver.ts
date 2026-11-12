/**
 * Native Stream Resolver
 * Resolves direct HLS (.m3u8) streams from providers using automated stealth browser
 * and caches results in memory for high-performance instant access.
 */

import { chromium, type BrowserContext } from 'playwright';
import fs from 'fs';
import { setupStealthPage, emulateHumanBehavior } from './stealth-config';

export interface ResolvedStream {
  id: string;
  tmdbId: number;
  kind: 'movie' | 'series';
  season?: number;
  episode?: number;
  playlistUrl: string;
  headers: Record<string, string>;
  createdAt: number;
  expiresAt: number;
  provider: string;
}

class StreamResolver {
  private cache = new Map<string, ResolvedStream>();
  private pending = new Map<string, Promise<ResolvedStream>>();
  private activeBrowsers = 0;
  private readonly MAX_CONCURRENT_BROWSERS = 3;
  private readonly CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

  private getBrowserPath(): string | undefined {
    const paths = [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ];
    return paths.find((p) => fs.existsSync(p));
  }

  private getCacheKey(req: { tmdbId: number; kind: 'movie' | 'series'; season?: number; episode?: number }): string {
    if (req.kind === 'series') {
      return `series-${req.tmdbId}-s${req.season ?? 1}e${req.episode ?? 1}`;
    }
    return `movie-${req.tmdbId}`;
  }

  /**
   * Resolves a media item to its direct HLS stream URL.
   */
  async resolve(req: {
    tmdbId: number;
    kind: 'movie' | 'series';
    season?: number;
    episode?: number;
  }): Promise<ResolvedStream> {
    const key = this.getCacheKey(req);

    // 1. Check in-memory cache
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[StreamResolver] Cache hit for ${key}`);
      return cached;
    }

    // 2. Check if already being resolved
    const inflight = this.pending.get(key);
    if (inflight) {
      console.log(`[StreamResolver] Waiting for in-flight resolution for ${key}`);
      return inflight;
    }

    // 3. Check concurrent browser session limit
    if (this.activeBrowsers >= this.MAX_CONCURRENT_BROWSERS) {
      throw new Error(`Too many concurrent stream resolutions (max ${this.MAX_CONCURRENT_BROWSERS}). Try again in a moment.`);
    }

    // 4. Start resolution
    const promise = this.sniffFromProvider(req, key);
    this.pending.set(key, promise);

    try {
      const result = await promise;
      this.cache.set(key, result);
      return result;
    } finally {
      this.pending.delete(key);
    }
  }

  /**
   * Retrieves a stream by its unique stream session ID.
   */
  getById(streamId: string): ResolvedStream | undefined {
    for (const item of this.cache.values()) {
      if (item.id === streamId) return item;
    }
    return undefined;
  }

  /**
   * Force re-resolve a stream by its cached stream ID (used by proxy on expiry).
   * Returns the new stream, or undefined if not found in cache.
   */
  async reResolveById(streamId: string): Promise<ResolvedStream | undefined> {
    for (const [key, item] of this.cache.entries()) {
      if (item.id === streamId) {
        // Evict expired entry and re-resolve
        this.cache.delete(key);
        return this.resolve({
          tmdbId: item.tmdbId,
          kind: item.kind,
          season: item.season,
          episode: item.episode,
        });
      }
    }
    return undefined;
  }

  /**
   * Returns how many browser sessions are currently active.
   */
  getActiveBrowserCount(): number {
    return this.activeBrowsers;
  }

  /**
   * Checks if a stream is already resolved and cached in memory.
   */
  getCached(req: { tmdbId: number; kind: 'movie' | 'series'; season?: number; episode?: number }): ResolvedStream | undefined {
    const key = this.getCacheKey(req);
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached;
    }
    return undefined;
  }

  private async sniffFromProvider(
    req: { tmdbId: number; kind: 'movie' | 'series'; season?: number; episode?: number },
    cacheKey: string
  ): Promise<ResolvedStream> {
    const startTime = Date.now();
    const timeoutMs = 25000;
    const browserPath = this.getBrowserPath();

    // Construct embed target URLs — try VidSrc first (primary), then VixSrc as fallback
    const providers: Array<{ name: string; url: string; referer: string }> = [];

    if (req.kind === 'series') {
      const s = req.season ?? 1;
      const e = req.episode ?? 1;
      providers.push({ name: 'VidSrc', url: `https://vidsrc.to/embed/tv/${req.tmdbId}/${s}/${e}`, referer: 'https://vidsrc.to/' });
      providers.push({ name: 'VixSrc', url: `https://vixsrc.to/tv/${req.tmdbId}/${s}/${e}`, referer: 'https://vixsrc.to/' });
    } else {
      providers.push({ name: 'VidSrc', url: `https://vidsrc.to/embed/movie/${req.tmdbId}`, referer: 'https://vidsrc.to/' });
      providers.push({ name: 'VixSrc', url: `https://vixsrc.to/movie/${req.tmdbId}`, referer: 'https://vixsrc.to/' });
    }

    console.log(`[StreamResolver] Starting stealth sniff — will try ${providers.length} providers`);
    console.log(`[StreamResolver] Using browser: ${browserPath || 'Bundled Chromium'}`);
    console.log(`[StreamResolver] Active browsers: ${this.activeBrowsers}/${this.MAX_CONCURRENT_BROWSERS}`);

    this.activeBrowsers++;
    let context: BrowserContext | null = null;

    try {
      const launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
          '--disable-web-security',
        ],
      };

      if (browserPath) {
        launchOptions.executablePath = browserPath;
      }

      const browser = await chromium.launch(launchOptions);
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        ignoreHTTPSErrors: true,
      });

      let resolvedResult: { url: string; headers: Record<string, string>; provider: string } | null = null;

      // Try each provider in turn — stop at first success
      for (const provider of providers) {
        const remainingTime = timeoutMs - (Date.now() - startTime);
        if (remainingTime < 3000) break; // Not enough time left

        const page = await context.newPage();
        let capturedUrl: string | undefined;
        let capturedHeaders: Record<string, string> | undefined;

        try {
          console.log(`[StreamResolver] Trying provider ${provider.name}: ${provider.url}`);

          // Stealth & popup blocking
          await setupStealthPage(page);
          page.on('popup', (popup) => { void popup.close().catch(() => {}); });

          // Stream detection promise
          const streamPromise = new Promise<{ url: string; headers: Record<string, string> }>((resolve) => {
            page.on('request', (request) => {
              const url = request.url();
              const resourceType = request.resourceType();
              const isThumb = url.includes('.vtt') || url.includes('.jpg') || url.includes('.png');
              const isM3u8 = (url.includes('.m3u8') || url.includes('playlist') || url.includes('master')) && !isThumb;
              const isMedia = (resourceType === 'media' || url.includes('.mp4')) && !isThumb;

              if ((isM3u8 || isMedia) && !capturedUrl) {
                if (!url.includes('doubleclick') && !url.includes('analytics') && !url.includes('google-analytics')) {
                  capturedUrl = url;
                  capturedHeaders = request.headers();
                  resolve({ url, headers: capturedHeaders });
                }
              }
            });

            page.on('response', (res) => {
              const url = res.url();
              const contentType = res.headers()['content-type'] || '';
              if ((contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl')) && !capturedUrl) {
                capturedUrl = url;
                capturedHeaders = res.request().headers();
                resolve({ url, headers: capturedHeaders });
              }
            });
          });

          // Navigate to embed
          await page.goto(provider.url, { waitUntil: 'domcontentloaded', timeout: Math.min(remainingTime - 1000, 15000) });

          // Emulate human presence
          await emulateHumanBehavior(page);

          // Trigger player play button if found
          const frames = page.frames();
          for (const frame of frames) {
            try {
              const playBtn = await frame.$('button, .play, #play, .play-button, [aria-label*="Play"], video');
              if (playBtn) {
                const box = await playBtn.boundingBox();
                if (box) {
                  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                  await page.mouse.down();
                  await new Promise((r) => setTimeout(r, 100));
                  await page.mouse.up();
                  break;
                }
              }
            } catch {
              // Frame detached or cross-origin restricted
            }
          }

          // Wait for stream with per-provider timeout
          const perProviderTimeout = Math.min(remainingTime - 1000, 15000);
          const result = await Promise.race([
            streamPromise,
            new Promise<null>((r) => setTimeout(() => r(null), perProviderTimeout)),
          ]);

          if (result) {
            console.log(`[StreamResolver] ✅ ${provider.name} resolved successfully`);
            resolvedResult = { ...result, provider: provider.name };
            break; // Success — no need to try more providers
          } else {
            console.log(`[StreamResolver] ❌ ${provider.name} timed out, trying next provider...`);
          }
        } catch (err: any) {
          console.log(`[StreamResolver] ❌ ${provider.name} failed: ${err.message}`);
        } finally {
          await page.close().catch(() => {});
        }
      }

      if (!resolvedResult) {
        throw new Error(`All providers failed for tmdbId=${req.tmdbId} kind=${req.kind}`);
      }

      const streamId = `stream-${Buffer.from(cacheKey).toString('hex').slice(0, 16)}`;
      const resolved: ResolvedStream = {
        id: streamId,
        tmdbId: req.tmdbId,
        kind: req.kind,
        season: req.season,
        episode: req.episode,
        playlistUrl: resolvedResult.url,
        headers: resolvedResult.headers,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.CACHE_TTL_MS,
        provider: resolvedResult.provider,
      };

      console.log(`[StreamResolver] Successfully resolved ${cacheKey} via ${resolvedResult.provider} in ${Date.now() - startTime}ms`);
      return resolved;
    } finally {
      this.activeBrowsers--;
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }
}

export const streamResolver = new StreamResolver();
