import type { Request, Response, NextFunction } from 'express';
import type { SessionManager, SessionPayload } from './session';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export function requireAuth(sessionManager: SessionManager) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = sessionManager.extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'unauthorized', message: 'No token provided' });
    }

    const user = sessionManager.verifyToken(token);

    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  };
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't block request
 */
export function optionalAuth(sessionManager: SessionManager) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = sessionManager.extractToken(req.headers.authorization);

    if (token) {
      const user = sessionManager.verifyToken(token);
      if (user) {
        req.user = user;
      }
    }

    next();
  };
}
