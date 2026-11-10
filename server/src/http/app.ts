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
  const authRoutes = createAuthRoutes(discord, sessions);
  app.use('/api/auth', authRoutes);

  // Room management routes
  registerRoomRoutes(app, sessions);

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
