import type { Config } from '../config';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
}

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Discord OAuth2 client
 * Handles login flow and user info fetching
 */
export class DiscordOAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly apiBase = 'https://discord.com/api/v10';

  constructor(config: Config) {
    this.clientId = config.discord.clientId || '';
    this.clientSecret = config.discord.clientSecret || '';
    this.redirectUri = config.discord.redirectUri || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('[Discord OAuth] Missing client credentials. Authentication will not work.');
    }
  }

  /**
   * Get Discord OAuth2 authorization URL
   */
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify guilds.members.read',
    });

    return `https://discord.com/oauth2/authorize?${params}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(code: string): Promise<DiscordTokenResponse> {
    const response = await fetch(`${this.apiBase}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for token');
    }

    return (await response.json()) as DiscordTokenResponse;
  }

  /**
   * Get user info from Discord API
   */
  async getUser(accessToken: string): Promise<DiscordUser> {
    const response = await fetch(`${this.apiBase}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return (await response.json()) as DiscordUser;
  }

  /**
   * Get user's Discord friends (connections)
   */
  async getFriends(accessToken: string): Promise<DiscordUser[]> {
    try {
      // Note: Discord doesn't expose friends list through OAuth2
      // We can only get guild members if user shares servers
      // For now, return empty array - we'll implement guild-based friend discovery later
      return [];
    } catch (error) {
      console.error('[Discord OAuth] Failed to fetch friends:', error);
      return [];
    }
  }
}
