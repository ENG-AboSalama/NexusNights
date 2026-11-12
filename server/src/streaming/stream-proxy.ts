/**
 * HLS Stream Proxy
 * Proxies HLS manifests (.m3u8) and video segments (.ts / .m4s / .key)
 * with the required Referer and Origin headers to bypass CORS and hotlinking blocks.
 *
 * Auto re-resolve: when the upstream playlist returns 403/410 (token expired),
 * the proxy evicts the cache entry and kicks off a new browser resolution.
 */

import express, { type Request, type Response } from 'express';
import { streamResolver, type ResolvedStream } from './stream-resolver';

export const streamProxyRouter = express.Router();

function rewriteManifest(manifestText: string, baseUrl: string, streamId: string): string {
  const lines = manifestText.split('\n');
  const rewrittenLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();

    // Handle URI attributes in tags like #EXT-X-KEY or #EXT-X-MEDIA
    if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
      const rewrittenTag = trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
        try {
          const absoluteUrl = new URL(uri, baseUrl).href;
          const proxiedUrl = `/api/stream-proxy/segment?id=${streamId}&url=${encodeURIComponent(absoluteUrl)}`;
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

    // Rewrite media segment or sub-playlist URL
    try {
      const absoluteUrl = new URL(trimmed, baseUrl).href;
      const proxiedUrl = `/api/stream-proxy/segment?id=${streamId}&url=${encodeURIComponent(absoluteUrl)}`;
      rewrittenLines.push(proxiedUrl);
    } catch {
      rewrittenLines.push(line);
    }
  }

  return rewrittenLines.join('\n');
}

/** Returns headers needed to pass hotlink / CORS protection */
function proxyHeaders(stream: ResolvedStream): Record<string, string> {
  return {
    'User-Agent': stream.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Referer': stream.headers['referer'] || 'https://vixsrc.to/',
    'Origin': stream.headers['origin'] || 'https://vixsrc.to',
  };
}

/** True when the upstream status indicates an expired / revoked token */
function isTokenExpired(status: number): boolean {
  return status === 403 || status === 401 || status === 410 || status === 400;
}

/**
 * GET /api/stream-proxy/master/:id.m3u8
 * Fetches and rewrites the master playlist.
 * On token expiry (403/401/410), kicks off a background re-resolution and
 * returns a 302 redirect to the new master playlist once it's ready.
 */
streamProxyRouter.get('/master/:id.m3u8', async (req: Request, res: Response) => {
  const { id } = req.params;
  let stream = streamResolver.getById(id);

  if (!stream) {
    // Stream ID unknown — maybe server restarted; nothing we can do
    res.status(404).send('Stream session expired or not found. Reload the page.');
    return;
  }

  try {
    const upstream = await fetch(stream.playlistUrl, {
      headers: proxyHeaders(stream),
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      if (isTokenExpired(upstream.status)) {
        console.log(`[StreamProxy] Token expired (${upstream.status}) for stream ${id}. Re-resolving…`);
        try {
          const freshStream = await streamResolver.reResolveById(id);
          if (freshStream && freshStream.id !== id) {
            // Redirect to the new stream master
            res.redirect(302, `/api/stream-proxy/master/${freshStream.id}.m3u8`);
          } else if (freshStream) {
            // Same ID but refreshed — serve immediately
            const freshUpstream = await fetch(freshStream.playlistUrl, {
              headers: proxyHeaders(freshStream),
              signal: AbortSignal.timeout(10000),
            });
            if (!freshUpstream.ok) {
              res.status(502).send(`Re-resolve upstream error: ${freshUpstream.statusText}`);
              return;
            }
            const manifestText = await freshUpstream.text();
            const rewritten = rewriteManifest(manifestText, freshStream.playlistUrl, freshStream.id);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(rewritten);
          } else {
            res.status(502).send('Stream token expired and re-resolution failed.');
          }
        } catch (reErr: any) {
          console.error(`[StreamProxy] Re-resolve failed: ${reErr.message}`);
          res.status(502).send(`Stream token expired and re-resolution failed: ${reErr.message}`);
        }
        return;
      }
      res.status(upstream.status).send(`Upstream playlist error: ${upstream.statusText}`);
      return;
    }

    const manifestText = await upstream.text();
    const rewritten = rewriteManifest(manifestText, stream.playlistUrl, stream.id);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(rewritten);
  } catch (err: any) {
    console.error(`[StreamProxy] Error serving master playlist ${id}:`, err.message);
    res.status(502).send(`Gateway Error: ${err.message}`);
  }
});

/**
 * GET /api/stream-proxy/segment
 * Proxies sub-playlists, video segments (.ts/.m4s), and encryption keys.
 * On token expiry, returns 410 so HLS.js triggers a manifest reload from the master.
 */
streamProxyRouter.get('/segment', async (req: Request, res: Response) => {
  const { id, url } = req.query as { id?: string; url?: string };

  if (!id || !url) {
    res.status(400).send('Missing id or url parameter');
    return;
  }

  const stream = streamResolver.getById(id);
  if (!stream) {
    res.status(404).send('Stream session expired or not found');
    return;
  }

  try {
    const headers: Record<string, string> = {
      ...proxyHeaders(stream),
    };

    // Forward Range header if requested (e.g. for seeking or partial byte fetching)
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const upstream = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      if (isTokenExpired(upstream.status)) {
        // Return 410 Gone — HLS.js will reload the master playlist
        // which will trigger re-resolution via the master endpoint
        console.log(`[StreamProxy] Segment token expired (${upstream.status}) for stream ${id}.`);
        res.status(410).send('Segment token expired');
        return;
      }
      res.status(upstream.status).send(`Upstream segment error: ${upstream.statusText}`);
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

    // If upstream returned another playlist (e.g. sub-variant playlist), rewrite it too!
    if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl') || url.includes('.m3u8') || url.includes('type=video') || url.includes('type=audio')) {
      const manifestText = await upstream.text();
      // If it has #EXTM3U, rewrite it
      if (manifestText.includes('#EXTM3U')) {
        const rewritten = rewriteManifest(manifestText, url, stream.id);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(rewritten);
        return;
      }
    }

    // Forward content headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      res.status(206);
      res.setHeader('Content-Range', contentRange);
    }

    // Stream the binary body
    if (!upstream.body) {
      res.end();
      return;
    }

    // Pipe ReadableStream (Web API) to Node.js writable response
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
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).send(`Gateway Error: ${err.message}`);
    }
  }
});
