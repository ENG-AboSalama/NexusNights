/**
 * Iframe Proxy Routes
 * 
 * Proxies embed URLs to make them same-origin, allowing captureStream() to work
 */

import { Router, type Request, type Response } from 'express';

export function createProxyRoutes() {
  const router = Router();

  /**
   * GET /api/proxy/embed?url=<embedUrl>
   * 
   * Returns HTML page that loads the embed URL in an iframe
   * This makes the embed same-origin for captureStream()
   */
  router.get('/embed', (req: Request, res: Response) => {
    const url = req.query.url as string | undefined;

    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Return HTML page with iframe
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NexusNight Player Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <iframe 
    src="${url.replace(/"/g, '&quot;')}" 
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
    allowfullscreen
  ></iframe>
</body>
</html>`;

    res.type('text/html').send(html);
  });

  return router;
}
