import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import type { LibraryService } from '../library/service';
import { DiscordOAuth } from '../auth/discord-oauth';
import { SessionManager } from '../auth/session';
import { ProgressStore } from '../realtime/progress';
import { createRoutes } from './routes';
import { createAuthRoutes } from './auth-routes';
import { registerRoomRoutes } from './room-routes';
import { attachStreamingRoutes } from './streaming-routes';
import { createProxyRoutes } from './proxy-routes';
import { ROOT } from '../config';

export function createApp(svc: LibraryService) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', svc.cfg.trustProxy);
  app.use(
    helmet({
      // Stage 3 adds a real CSP + frame-ancestors for Discord; Activities are *embedded* in an iframe,
      // so X-Frame-Options must NOT be set.
      contentSecurityPolicy: false,
      frameguard: false,
    }),
  );
  // Discord's proxy strips "/.proxy" before forwarding; this keeps the same URLs working when the
  // app is opened through another proxy (or when testing the in-Discord code path locally).
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.proxy/')) req.url = req.url.slice('/.proxy'.length);
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const discord = new DiscordOAuth(svc.cfg);
  const sessions = new SessionManager(svc.cfg);
  const progress = new ProgressStore(svc.cfg);
  void progress.load();

  // Auth routes
  const authRoutes = createAuthRoutes(discord, sessions, svc.cfg);
  app.use('/api/auth', authRoutes);

  // Proxy routes (for same-origin embeds)
  app.use('/api/proxy', createProxyRoutes());

  // Room management routes
  registerRoomRoutes(app, sessions);

  // Streaming routes (server-side streaming)
  attachStreamingRoutes(app, sessions);

  // HLS streaming directory (serve .m3u8 and .ts files)
  const hlsDir = path.resolve(ROOT, 'data', 'hls');
  if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
  }
  app.use('/hls', express.static(hlsDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.m3u8')) {
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.endsWith('.ts')) {
        res.set('Content-Type', 'video/MP2T');
        res.set('Cache-Control', 'public, max-age=3600');
      }
      res.set('Access-Control-Allow-Origin', '*');
    },
  }));

  // IMPORTANT: Missing HLS segments/manifests must return 404, never fall through to SPA index.html!
  app.use('/hls', (_req, res) => {
    res.status(404).type('text/plain').send('HLS resource not ready or not found');
  });

  // Main API routes
  const { router, adminToken } = createRoutes(svc, { sessions, progress });
  app.use('/api', router);

  // Production: one process serves API + the built React client (client/dist).
  const dist = svc.cfg.clientDir;
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '365d', immutable: true }));
    app.use(express.static(dist, { maxAge: '5m', index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return { app, adminToken, sessions, progress };
}
