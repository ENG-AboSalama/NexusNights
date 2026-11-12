import * as jwt from 'jsonwebtoken';
import type { Config } from '../config';
import type { DiscordUser } from './discord-oauth';

export interface SessionPayload {
  id: string;
  userId: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  globalName: string | null;
  roles?: string[];
  privileged?: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * JWT-based session management
 * Replaces Discord Activity token verification
 */
export class SessionManager {
  private readonly config: Config;
  private readonly secret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor(config: Config) {
    this.config = config;
    this.secret = process.env.JWT_SECRET || config.jwtSecret || 'change-me-in-production';
    this.accessTokenExpiry = '7d';
    this.refreshTokenExpiry = '30d';

    if (this.secret === 'change-me-in-production') {
      console.warn('[Session] Using default JWT secret. Please set JWT_SECRET in environment variables.');
    }
  }

  /**
   * Create access and refresh tokens for a user
   */
  createTokens(user: DiscordUser & { roles?: string[]; privileged?: boolean; isPrivileged?: boolean }): TokenPair {
    const hasPrivilegedRole = Array.isArray(user.roles) && user.roles.some((r: string) => this.config.controlRoleIds?.includes(r));
    const payload: SessionPayload = {
      id: user.id,
      userId: user.id,
      username: user.username,
      discriminator: user.discriminator || '0',
      avatar: user.avatar,
      globalName: user.global_name || (user as any).globalName || null,
      roles: user.roles || [],
      privileged: !!user.privileged || !!user.isPrivileged || hasPrivilegedRole,
    };

    const accessToken = jwt.sign(payload, this.secret, {
      expiresIn: this.accessTokenExpiry,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ userId: user.id }, this.secret, {
      expiresIn: this.refreshTokenExpiry,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode an access token
   * @throws Error if token is invalid or expired
   */
  verifyToken(token: string): SessionPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as SessionPayload;
      return decoded;
    } catch (error) {
      throw new Error('invalid_token');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractToken(authHeader?: string): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }
}
