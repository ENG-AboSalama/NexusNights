import express, { type Request, type Response } from 'express';
import type { DiscordOAuth } from '../auth/discord-oauth';
import type { SessionManager } from '../auth/session';
import { requireAuth } from '../auth/middleware';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: express.NextFunction) => {
  fn(req, res).catch(next);
};

/**
 * Authentication routes using Discord OAuth2
 * Replaces Discord Activity authentication
 */
export function createAuthRoutes(discord: DiscordOAuth, sessions: SessionManager): express.Router {
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
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
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
