/**
 * Provider Stream Proxy
 * Proxies HLS streams from providers (e.g., Dizibal) with required headers to bypass CORS.
 */

import express, { type Request, type Response } from 'express';
import type { ProviderSource } from './types';

export const providerStreamProxyRouter = express.Router();

interface StoredProviderStream {
  source: ProviderSource;
  timestamp: number;
}

// Simple in-memory registry for provider streams (keyed by source.id)
const providerStreams = new Map<string, StoredProviderStream>();

// Cleanup old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours
  for (const [id, stored] of providerStreams.entries()) {
    if (now - stored.timestamp > maxAge) {
      providerStreams.delete(id);
    }
  }
}, 30 * 60 * 1000);

/**
 * Register a provider source for proxying
 */
export function registerProviderStream(source: ProviderSource): void {
  if (source.type === 'hls' && source.headers) {
    providerStreams.set(source.id, {
      source,
      timestamp: Date.now(),
    });
  }
}

/**
 * Get provider source by ID
 */
export function getProviderStream(id: string): ProviderSource | null {
  const stored = providerStreams.get(id);
  return stored ? stored.source : null;
}

/**
 * Check if a URL points to a CORS-enabled CDN that the browser can fetch directly.
 * Dizibal segments live on pilavyer*.top which serves Access-Control-Allow-Origin: *.
 * Playlists and keys live on the player host (pilavyerplay.top) which does NOT send CORS.
 */
function isCorsEnabledCdn(absoluteUrl: string, baseUrl: string): boolean {
  try {
    const segHost = new URL(absoluteUrl).hostname;
    const baseHost = new URL(baseUrl).hostname;
    // External CDN host (different from player host) = direct fetch OK
    return segHost !== baseHost;
  } catch {
    return false;
  }
}

/**
 * Check if a URL is likely an HLS playlist (not a binary segment).
 */
function isPlaylistUrl(url: string): boolean {
  return url.includes('.m3u8') || /stream\.php\b/.test(url);
}

/**
 * Rewrite HLS manifest:
 * - Playlists and keys → always proxy (they need server-side CORS + rewriting)
 * - Video/audio segments on CORS-enabled CDN → leave direct (fast, no server overhead)
 * - Segments on restricted host → proxy
 */
function rewriteManifest(manifestText: string, baseUrl: string, sourceId: string): string {
  const lines = manifestText.split('\n');
  const rewrittenLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();

    // Handle URI attributes in tags like #EXT-X-KEY, #EXT-X-MEDIA
    if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
      const rewrittenTag = trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
        try {
          const absoluteUrl = new URL(uri, baseUrl).href;
          // URI in tags are always playlists or keys → always proxy
          const proxiedUrl = `/api/provider-stream-proxy/segment?id=${sourceId}&url=${encodeURIComponent(absoluteUrl)}`;
          return `URI="${proxiedUrl}"`;
        } catch {
          return `URI="${uri}"`;
        }
      });
      rewrittenLines.push(rewrittenTag);
      continue;
    }

    // Ignore comments or empty lines
    if (trimmed.startsWith('#') || trimmed.length === 0) {
      rewrittenLines.push(line);
      continue;
    }

    // Non-comment lines: sub-playlists or media segments
    try {
      const absoluteUrl = new URL(trimmed, baseUrl).href;

      if (isPlaylistUrl(absoluteUrl)) {
        // Sub-playlists must be proxied so their inner URLs get rewritten
        const proxiedUrl = `/api/provider-stream-proxy/segment?id=${sourceId}&url=${encodeURIComponent(absoluteUrl)}`;
        rewrittenLines.push(proxiedUrl);
      } else if (isCorsEnabledCdn(absoluteUrl, baseUrl)) {
        // Media segment on CDN with CORS → let the browser fetch directly!
        // This eliminates the server as middleman → dramatically faster + instant seeks
        rewrittenLines.push(absoluteUrl);
      } else {
        // Segment on restricted host → proxy it
        const proxiedUrl = `/api/provider-stream-proxy/segment?id=${sourceId}&url=${encodeURIComponent(absoluteUrl)}`;
        rewrittenLines.push(proxiedUrl);
      }
    } catch {
      rewrittenLines.push(line);
    }
  }

  return rewrittenLines.join('\n');
}

/**
 * GET /api/provider-stream-proxy/master/:id.m3u8
 * Fetches and rewrites the master/media playlist
 */
providerStreamProxyRouter.get('/master/:id.m3u8', async (req: Request, res: Response) => {
  const { id } = req.params;
  const source = getProviderStream(id);

  if (!source) {
    console.warn(`[ProviderStreamProxy] Stream ${id} not found or expired`);
    res.status(404).send('Provider stream not found or expired');
    return;
  }

  console.log(`[ProviderStreamProxy] Fetching master playlist from: ${source.url.substring(0, 100)}...`);

  try {
    const upstream = await fetch(source.url, {
      headers: source.headers || {},
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      console.error(`[ProviderStreamProxy] Upstream error ${upstream.status} for ${source.url.substring(0, 100)}`);
      res.status(502).send(`Upstream server returned ${upstream.status}`);
      return;
    }

    const manifestText = await upstream.text();
    console.log(`[ProviderStreamProxy] Master playlist fetched: ${manifestText.length} bytes`);
    
    // Use the full source URL as the base so that relative paths in the manifest
    // (e.g. "stream.php?v=...&p=...") resolve correctly against query-string URLs.
    const baseUrl = source.url;
    const rewritten = rewriteManifest(manifestText, baseUrl, id);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(rewritten);
    
    console.log(`[ProviderStreamProxy] Master playlist sent successfully`);
  } catch (error: any) {
    console.error('[ProviderStreamProxy] Master fetch error:', error.message);
    res.status(502).send('Failed to fetch upstream playlist');
  }
});

/**
 * GET /api/provider-stream-proxy/segment?id=...&url=...
 * Proxies video segments, sub-playlists, and encryption keys
 */
providerStreamProxyRouter.get('/segment', async (req: Request, res: Response) => {
  const { id, url } = req.query as { id?: string; url?: string };

  if (!id || !url) {
    res.status(400).send('Missing id or url');
    return;
  }

  const source = getProviderStream(id);
  if (!source) {
    console.warn(`[ProviderStreamProxy] Stream ${id} not found or expired`);
    res.status(404).send('Provider stream not found');
    return;
  }

  try {
    const upstream = await fetch(url, {
      headers: source.headers || {},
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      console.error(`[ProviderStreamProxy] Segment error ${upstream.status} for ${url.substring(0, 100)}`);
      res.status(upstream.status).send(`Upstream error ${upstream.status}`);
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';

    // Detect sub-playlists: check content-type, extension, AND stream.php pattern (Dizibal)
    const looksLikePlaylist =
      contentType.includes('mpegurl') ||
      url.includes('.m3u8') ||
      isPlaylistUrl(url);

    if (looksLikePlaylist) {
      const manifestText = await upstream.text();

      // Verify it's actually an HLS playlist (stream.php may return different content types)
      if (manifestText.includes('#EXTM3U')) {
        // Use the full URL as base so relative segment URLs resolve correctly
        const baseUrl = url;
        const rewritten = rewriteManifest(manifestText, baseUrl, id);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(rewritten);
        return;
      }

      // Not a playlist after all — send as-is
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(manifestText);
      return;
    }

    // Binary data (encryption key, or any remaining proxied segment)
    // Stream it instead of buffering the whole thing in memory
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    if (!upstream.body) {
      res.end();
      return;
    }

    // Pipe ReadableStream → Node.js response (no buffering!)
    const reader = upstream.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (err: any) {
        res.destroy(err);
      }
    };
    void pump();
  } catch (error: any) {
    if (!res.headersSent) {
      console.error(`[ProviderStreamProxy] Segment fetch error for ${url.substring(0, 100)}:`, error.message);
      res.status(502).send('Failed to fetch segment');
    }
  }
});
