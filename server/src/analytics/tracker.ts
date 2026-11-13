/**
 * Analytics Tracker
 * Track user sessions, IPs, countries, and streaming activity
 */

interface SessionData {
  ip: string;
  country: string;
  city: string;
  firstSeen: number;
  lastSeen: number;
  requests: number;
  streamingRequests: number;
}

interface StreamingActivity {
  tmdbId: number;
  kind: 'movie' | 'series';
  title: string;
  season?: number;
  episode?: number;
  watchCount: number;
  uniqueUsers: Set<string>;
  lastWatched: number;
}

class AnalyticsTracker {
  private sessions = new Map<string, SessionData>();
  private streamingActivity = new Map<string, StreamingActivity>();
  private readonly MAX_SESSIONS = 1000;
  private readonly SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Track a request from a user
   */
  trackRequest(ip: string, isStreaming: boolean = false): void {
    const sessionId = this.hashIP(ip);
    const now = Date.now();

    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        ip: this.anonymizeIP(ip),
        country: this.getCountryFromIP(ip),
        city: '',
        firstSeen: now,
        lastSeen: now,
        requests: 0,
        streamingRequests: 0,
      };
      this.sessions.set(sessionId, session);
      
      // Cleanup old sessions if limit exceeded
      if (this.sessions.size > this.MAX_SESSIONS) {
        this.cleanupOldSessions();
      }
    }

    session.lastSeen = now;
    session.requests++;
    if (isStreaming) session.streamingRequests++;
  }

  /**
   * Track streaming activity
   */
  trackStreaming(data: {
    tmdbId: number;
    kind: 'movie' | 'series';
    title: string;
    season?: number;
    episode?: number;
    userIP: string;
  }): void {
    const key = data.kind === 'movie' 
      ? `movie-${data.tmdbId}`
      : `tv-${data.tmdbId}-${data.season}-${data.episode}`;
    
    const userId = this.hashIP(data.userIP);
    
    let activity = this.streamingActivity.get(key);
    if (!activity) {
      activity = {
        tmdbId: data.tmdbId,
        kind: data.kind,
        title: data.title,
        season: data.season,
        episode: data.episode,
        watchCount: 0,
        uniqueUsers: new Set(),
        lastWatched: Date.now(),
      };
      this.streamingActivity.set(key, activity);
    }

    activity.watchCount++;
    activity.uniqueUsers.add(userId);
    activity.lastWatched = Date.now();
  }

  /**
   * Get traffic sources (countries)
   */
  getTrafficSources(): Array<{ country: string; count: number; percentage: number }> {
    const countries = new Map<string, number>();
    
    for (const session of this.sessions.values()) {
      const count = countries.get(session.country) || 0;
      countries.set(session.country, count + 1);
    }

    const total = this.sessions.size;
    const sources = Array.from(countries.entries())
      .map(([country, count]) => ({
        country,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return sources;
  }

  /**
   * Get top streaming content
   */
  getTopStreaming(limit: number = 20): Array<{
    tmdbId: number;
    kind: 'movie' | 'series';
    title: string;
    season?: number;
    episode?: number;
    watchCount: number;
    uniqueViewers: number;
    lastWatched: number;
  }> {
    return Array.from(this.streamingActivity.values())
      .map((a) => ({
        tmdbId: a.tmdbId,
        kind: a.kind,
        title: a.title,
        season: a.season,
        episode: a.episode,
        watchCount: a.watchCount,
        uniqueViewers: a.uniqueUsers.size,
        lastWatched: a.lastWatched,
      }))
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, limit);
  }

  /**
   * Get active sessions (last 5 minutes)
   */
  getActiveSessions(): number {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    let count = 0;
    
    for (const session of this.sessions.values()) {
      if (now - session.lastSeen < fiveMinutes) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get total unique users (24h)
   */
  getTotalUsers(): number {
    return this.sessions.size;
  }

  /**
   * Cleanup old sessions
   */
  private cleanupOldSessions(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastSeen > this.SESSION_EXPIRY) {
        toDelete.push(id);
      }
    }

    // If still too many, remove oldest
    if (toDelete.length === 0 && this.sessions.size > this.MAX_SESSIONS) {
      const sorted = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      
      const removeCount = this.sessions.size - this.MAX_SESSIONS + 100;
      for (let i = 0; i < removeCount && i < sorted.length; i++) {
        toDelete.push(sorted[i][0]);
      }
    }

    for (const id of toDelete) {
      this.sessions.delete(id);
    }
  }

  /**
   * Hash IP for privacy
   */
  private hashIP(ip: string): string {
    // Simple hash for session tracking (not cryptographic)
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      const char = ip.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Anonymize IP (remove last octet for IPv4, last 80 bits for IPv6)
   */
  private anonymizeIP(ip: string): string {
    if (ip.includes(':')) {
      // IPv6: keep first 48 bits
      const parts = ip.split(':');
      return parts.slice(0, 3).join(':') + ':xxxx:xxxx:xxxx:xxxx';
    } else {
      // IPv4: remove last octet
      const parts = ip.split('.');
      return parts.slice(0, 3).join('.') + '.xxx';
    }
  }

  /**
   * Get country from IP (simplified - use geoip library in production)
   */
  private getCountryFromIP(ip: string): string {
    // Placeholder - in production, use maxmind-db-reader or geoip-lite
    if (ip.startsWith('127.') || ip === '::1') return 'Local';
    if (ip.startsWith('192.168.') || ip.startsWith('10.')) return 'Private';
    
    // Default to Unknown - replace with actual GeoIP lookup
    return 'Unknown';
  }

  /**
   * Get stats summary
   */
  getStats() {
    return {
      totalUsers: this.getTotalUsers(),
      activeSessions: this.getActiveSessions(),
      trafficSources: this.getTrafficSources(),
      topStreaming: this.getTopStreaming(20),
    };
  }
}

export const analyticsTracker = new AnalyticsTracker();
