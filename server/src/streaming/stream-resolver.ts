/**
 * Native Stream Resolver
 * Resolves direct HLS (.m3u8) streams from providers using automated stealth browser
 * and caches results in memory for high-performance instant access.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import fs from 'fs';

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

    // Construct embed target URLs — VixSrc provides direct HLS (.m3u8), VidSrc as fallback
    const providers: Array<{ name: string; url: string; referer: string }> = [];

    if (req.kind === 'series') {
      const s = req.season ?? 1;
      const e = req.episode ?? 1;
      providers.push({ name: 'VixSrc', url: `https://vixsrc.to/tv/${req.tmdbId}/${s}/${e}`, referer: 'https://vixsrc.to/' });
      providers.push({ name: 'VidSrc', url: `https://vidsrc.to/embed/tv/${req.tmdbId}/${s}/${e}`, referer: 'https://vidsrc.to/' });
    } else {
      providers.push({ name: 'VixSrc', url: `https://vixsrc.to/movie/${req.tmdbId}`, referer: 'https://vixsrc.to/' });
      providers.push({ name: 'VidSrc', url: `https://vidsrc.to/embed/movie/${req.tmdbId}`, referer: 'https://vidsrc.to/' });
    }

    console.log(`[StreamResolver] Starting stealth sniff — will try ${providers.length} providers`);
    console.log(`[StreamResolver] Using browser: ${browserPath || 'Bundled Chromium'}`);
    console.log(`[StreamResolver] Active browsers: ${this.activeBrowsers}/${this.MAX_CONCURRENT_BROWSERS}`);

    this.activeBrowsers++;
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      const launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--single-process',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
          '--disable-web-security',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1280,720',
        ],
      };

      if (browserPath) {
        launchOptions.executablePath = browserPath;
      }

      browser = await chromium.launch(launchOptions);
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
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

        let targetUrl = provider.url;
        let navReferer = provider.referer;

        // Pre-check for VixSrc: fast 1-second check to see if title exists (avoid 10s timeout on 404)
        if (provider.name === 'VixSrc') {
          try {
            const apiPath = req.kind === 'series'
              ? `tv/${req.tmdbId}/${req.season ?? 1}/${req.episode ?? 1}`
              : `movie/${req.tmdbId}`;
            const checkRes = await fetch(`https://vixsrc.to/api/${apiPath}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Referer': provider.url,
              },
              signal: AbortSignal.timeout(3000),
            });
            if (checkRes.status === 404) {
              console.log(`[StreamResolver] ℹ️ VixSrc does not have this title (404), skipping...`);
              continue;
            }
            if (checkRes.ok) {
              const apiData: any = await checkRes.json().catch(() => null);
              if (apiData?.src) {
                targetUrl = `https://vixsrc.to${apiData.src}`;
                navReferer = 'https://vixsrc.to/';
                console.log(`[StreamResolver] ⚡ VixSrc direct embed target: ${targetUrl}`);
              }
            }
          } catch {
            // If check fails due to network, continue to standard browser attempt
          }
        }

        const page = await context.newPage();
        await page.setExtraHTTPHeaders({ 'Referer': navReferer }).catch(() => {});
        let capturedUrl: string | undefined;
        let capturedHeaders: Record<string, string> | undefined;

        try {
          console.log(`[StreamResolver] Trying provider ${provider.name}: ${targetUrl}`);

          // Close popups immediately
          page.on('popup', (popup) => { void popup.close().catch(() => {}); });

          // Stream detection promise
          const streamPromise = new Promise<{ url: string; headers: Record<string, string> }>((resolve) => {
            page.on('request', (request) => {
              const url = request.url();
              const resourceType = request.resourceType();
              const isThumb = url.includes('.vtt') || url.includes('.jpg') || url.includes('.png');
              const isPing = url.includes('ping.gif') || url.includes('doubleclick') || url.includes('analytics');
              
              const isM3u8Playlist = url.includes('/playlist/') && !isPing && !isThumb;
              const isDirectM3u8 = (url.includes('.m3u8') || url.includes('master.m3u8')) && !isThumb && !isPing;
              const isDirectMedia = resourceType === 'media' && (url.includes('.mp4') || url.includes('.m3u8')) && !isThumb;

              if ((isM3u8Playlist || isDirectM3u8 || isDirectMedia) && !capturedUrl) {
                capturedUrl = url;
                capturedHeaders = request.headers();
                resolve({ url, headers: capturedHeaders });
              }
            });

            page.on('response', (res) => {
              const url = res.url();
              const isPing = url.includes('ping.gif') || url.includes('analytics');
              const contentType = (res.headers()['content-type'] || '').toLowerCase();
              const isMpegUrl = contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl');

              if (isMpegUrl && !isPing && !capturedUrl) {
                capturedUrl = url;
                capturedHeaders = res.request().headers();
                resolve({ url, headers: capturedHeaders });
              }
            });
          });

          // Navigate to target embed URL
          const navTimeout = Math.min(remainingTime - 1000, 10000);
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });

          // Wait for stream to be captured (with per-provider timeout)
          const perProviderTimeout = Math.min(remainingTime - 1000, 10000);
          const result = await Promise.race([
            streamPromise,
            new Promise<null>((r) => setTimeout(() => r(null), perProviderTimeout)),
          ]);

          if (result) {
            console.log(`[StreamResolver] ✅ ${provider.name} resolved successfully in ${Date.now() - startTime}ms`);
            resolvedResult = { ...result, provider: provider.name };
            break; // Success — stop trying further providers
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
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}

export const streamResolver = new StreamResolver();
