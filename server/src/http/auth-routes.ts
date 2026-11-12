import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { DiscordOAuth } from '../auth/discord-oauth';
import type { SessionManager } from '../auth/session';
import type { Config } from '../config';
import { requireAuth } from '../auth/middleware';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: express.NextFunction) => {
  fn(req, res).catch(next);
};

/** Constant-time compare so admin tokens can't be brute-forced by timing. */
function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Authentication routes using Discord OAuth2
 * Replaces Discord Activity authentication
 */
export function createAuthRoutes(discord: DiscordOAuth, sessions: SessionManager, cfg: Config): express.Router {
  const router = express.Router();

  // Redirect to Discord OAuth2
  router.get('/discord', (req, res) => {
    const authUrl = discord.getAuthUrl();
    res.redirect(authUrl);
  });

  // OAuth2 callback
  router.get('/discord/callback', wrap(async (req, res) => {
    const code = req.query.code as string;

    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    try {
      // Exchange code for access token
      const tokenData = await discord.exchangeCode(code);
      
      // Get user info
      const user = await discord.getUser(tokenData.access_token);

      // Create JWT tokens
      const { accessToken } = sessions.createTokens(user);

      // Redirect to client with token (use hash-based routing)
      // CLIENT_URL wins if set. Otherwise: on a real domain redirect back to the
      // same origin (the server also serves the built client); only fall back to
      // the Vite dev server when the callback itself was hit on localhost.
      const host = String(req.get('x-forwarded-host') || req.get('host') || '');
      const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
      const clientUrl = (process.env.CLIENT_URL || (isLocal ? 'http://localhost:5173' : '')).replace(/\/+$/, '');
      res.redirect(`${clientUrl}/#/?token=${accessToken}`);
    } catch (error) {
      console.error('[Auth] OAuth callback failed:', error);
      res.status(500).send('Authentication failed');
    }
  }));

  // Get current user
  router.get('/me', requireAuth(sessions), (req, res) => {
    res.json({
      ...req.user,
      id: req.user?.id || req.user?.userId,
      userId: req.user?.userId || req.user?.id,
    });
  });

  /**
   * GET /api/auth/is-admin
   * True when the caller is the configured Discord admin OR supplies a valid ADMIN_TOKEN.
   * The token path lets you open the dashboard without a Discord identity.
   */
  router.get('/is-admin', (req, res) => {
    const provided = (req.get('x-admin-token') ?? '').trim();
    const byToken = cfg.adminToken ? tokenMatches(provided, cfg.adminToken) : false;

    let byDiscord = false;
    if (cfg.adminDiscordId) {
      const session = sessions.extractToken(req.headers.authorization);
      if (session) {
        try {
          const user = sessions.verifyToken(session);
          byDiscord = user.id === cfg.adminDiscordId || user.userId === cfg.adminDiscordId;
        } catch { /* invalid/expired token → not an admin */ }
      }
    }

    res.json({ isAdmin: byToken || byDiscord });
  });

  // Logout
  router.post('/logout', (req, res) => {
    // JWT tokens are stateless, so we just tell client to delete it
    res.json({ success: true });
  });

  // Get user's friends (placeholder for now)
  router.get('/friends', requireAuth(sessions), wrap(async (req, res) => {
    // TODO: Implement friend discovery via shared Discord servers
    res.json({ friends: [] });
  }));

  return router;
}