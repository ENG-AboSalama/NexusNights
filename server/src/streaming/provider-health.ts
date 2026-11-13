/**
 * Provider Health Tracking & Intelligent Failover
 * Stage 6: Monitors provider reliability and implements smart source selection
 */

export interface ProviderFailure {
  provider: string;
  sourceUrl: string;
  failureType: FailureType;
  timestamp: number;
  responseStatus?: number;
  errorDetails?: string;
}

export type FailureType =
  | 'cloudflare_challenge'     // cf-mitigated header or Cloudflare HTML
  | 'http_403_forbidden'       // Access denied (non-Cloudflare)
  | 'http_404_not_found'       // Source expired/removed
  | 'http_timeout'             // Network timeout
  | 'invalid_manifest'         // Malformed HLS/DASH
  | 'unsupported_format'       // Codec/container not playable
  | 'provider_unavailable';    // DNS/connection failure

export interface ProviderHealthStats {
  provider: string;
  totalAttempts: number;
  successfulAttempts: number;
  failures: Map<FailureType, number>;
  lastSuccess: number | null;
  lastFailure: number | null;
  cooldownUntil: number | null;
}

export class ProviderHealthTracker {
  private providerStats = new Map<string, ProviderHealthStats>();
  private sourceFailures = new Map<string, ProviderFailure[]>();
  private readonly MAX_FAILURE_HISTORY = 100;
  private readonly COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  private readonly FAILURE_THRESHOLD = 3; // Failures before cooldown

  /**
   * Classify failure type based on response
   */
  classifyFailure(
    statusCode: number,
    responseHeaders: Record<string, string>,
    responseBody?: string
  ): FailureType {
    // Check for Cloudflare challenge
    if (responseHeaders['cf-mitigated'] || responseHeaders['cf-ray']) {
      if (statusCode === 403 && responseBody?.includes('Cloudflare')) {
        return 'cloudflare_challenge';
      }
    }

    // Check response body for Cloudflare patterns
    if (responseBody) {
      if (responseBody.includes('Attention Required! | Cloudflare')) {
        return 'cloudflare_challenge';
      }
      if (responseBody.includes('Just a moment...')) {
        return 'cloudflare_challenge';
      }
    }

    // HTTP status classification
    switch (statusCode) {
      case 403:
        return 'http_403_forbidden';
      case 404:
        return 'http_404_not_found';
      case 0:
      case 408:
      case 504:
        return 'http_timeout';
      default:
        if (statusCode >= 500) {
          return 'provider_unavailable';
        }
        return 'http_403_forbidden'; // Generic access denied
    }
  }

  /**
   * Record a provider failure
   */
  recordFailure(failure: ProviderFailure): void {
    const provider = failure.provider.toLowerCase();
    const sourceUrl = failure.sourceUrl;

    // Update provider stats
    let stats = this.providerStats.get(provider);
    if (!stats) {
      stats = {
        provider,
        totalAttempts: 0,
        successfulAttempts: 0,
        failures: new Map(),
        lastSuccess: null,
        lastFailure: null,
        cooldownUntil: null,
      };
      this.providerStats.set(provider, stats);
    }

    stats.totalAttempts++;
    stats.lastFailure = failure.timestamp;
    const failureCount = (stats.failures.get(failure.failureType) || 0) + 1;
    stats.failures.set(failure.failureType, failureCount);

    // Apply cooldown if threshold exceeded
    const recentFailures = this.getRecentFailures(provider, 60000); // Last minute
    if (recentFailures.length >= this.FAILURE_THRESHOLD) {
      stats.cooldownUntil = Date.now() + this.COOLDOWN_DURATION_MS;
      console.log(
        `[ProviderHealth] ${provider} entered cooldown until ${new Date(stats.cooldownUntil).toISOString()}`
      );
    }

    // Store source-specific failure
    const sourceHistory = this.sourceFailures.get(sourceUrl) || [];
    sourceHistory.push(failure);
    if (sourceHistory.length > this.MAX_FAILURE_HISTORY) {
      sourceHistory.shift(); // Keep only recent history
    }
    this.sourceFailures.set(sourceUrl, sourceHistory);

    console.log(
      `[ProviderHealth] Failure recorded: ${provider} - ${failure.failureType} (status: ${failure.responseStatus})`
    );
  }

  /**
   * Record a successful playback
   */
  recordSuccess(provider: string, sourceUrl: string): void {
    const p = provider.toLowerCase();
    let stats = this.providerStats.get(p);
    if (!stats) {
      stats = {
        provider: p,
        totalAttempts: 0,
        successfulAttempts: 0,
        failures: new Map(),
        lastSuccess: null,
        lastFailure: null,
        cooldownUntil: null,
      };
      this.providerStats.set(p, stats);
    }

    stats.totalAttempts++;
    stats.successfulAttempts++;
    stats.lastSuccess = Date.now();

    // Clear cooldown on success
    if (stats.cooldownUntil && Date.now() > stats.cooldownUntil) {
      stats.cooldownUntil = null;
    }

    console.log(`[ProviderHealth] Success recorded: ${provider}`);
  }

  /**
   * Check if a provider is currently in cooldown
   */
  isProviderInCooldown(provider: string): boolean {
    const stats = this.providerStats.get(provider.toLowerCase());
    if (!stats || !stats.cooldownUntil) return false;
    
    if (Date.now() > stats.cooldownUntil) {
      stats.cooldownUntil = null;
      return false;
    }
    
    return true;
  }

  /**
   * Check if a specific source has failed recently
   */
  isSourceFailed(sourceUrl: string, withinMs = 60000): boolean {
    const failures = this.sourceFailures.get(sourceUrl);
    if (!failures || failures.length === 0) return false;

    const recent = failures.filter(f => Date.now() - f.timestamp < withinMs);
    return recent.length > 0;
  }

  /**
   * Get recent failures for a provider
   */
  private getRecentFailures(provider: string, withinMs: number): ProviderFailure[] {
    const p = provider.toLowerCase();
    const failures: ProviderFailure[] = [];
    for (const [, history] of this.sourceFailures) {
      const providerFailures = history.filter(
        f => f.provider.toLowerCase() === p && Date.now() - f.timestamp < withinMs
      );
      failures.push(...providerFailures);
    }
    return failures;
  }

  /**
   * Get provider health score (0-1, higher is better)
   */
  getProviderScore(provider: string): number {
    const p = provider.toLowerCase();
    const stats = this.providerStats.get(p);
    if (!stats || stats.totalAttempts === 0) return 0.5; // Neutral for unknown

    // Provider in cooldown gets very low score
    if (this.isProviderInCooldown(p)) return 0.1;

    const successRate = stats.successfulAttempts / stats.totalAttempts;
    
    // Penalize recent failures
    const recentFailures = this.getRecentFailures(provider, 300000); // Last 5 minutes
    const recentPenalty = Math.min(recentFailures.length * 0.1, 0.5);

    return Math.max(0, successRate - recentPenalty);
  }

  /**
   * Get success rate as percentage string
   */
  getSuccessRate(provider: string): string {
    const p = provider.toLowerCase();
    const stats = this.providerStats.get(p);
    if (!stats || stats.totalAttempts === 0) return '0%';
    
    const rate = (stats.successfulAttempts / stats.totalAttempts) * 100;
    return `${rate.toFixed(1)}%`;
  }

  /**
   * Get total attempts for a provider
   */
  getAttempts(provider: string): number {
    const stats = this.providerStats.get(provider.toLowerCase());
    return stats?.totalAttempts || 0;
  }

  /**
   * Get all provider stats
   */
  getAllStats(): Map<string, ProviderHealthStats> {
    return new Map(this.providerStats);
  }

  /**
   * Get stats for a specific provider
   */
  getStats(provider: string): ProviderHealthStats | undefined {
    return this.providerStats.get(provider.toLowerCase());
  }

  /**
   * Reset cooldown and failure history for a single provider
   */
  resetProvider(provider: string): void {
    const p = provider.toLowerCase();
    const stats = this.providerStats.get(p);
    if (stats) {
      stats.cooldownUntil = null;
      stats.failures.clear();
    }
  }

  /**
   * Reset cooldown and failure history for all providers
   */
  resetAllCooldowns(): void {
    for (const stats of this.providerStats.values()) {
      stats.cooldownUntil = null;
      stats.failures.clear();
    }
    this.sourceFailures.clear();
  }

  /**
   * Clear old failure history (cleanup task)
   */
  clearOldHistory(olderThanMs = 3600000): void {
    const cutoff = Date.now() - olderThanMs;
    
    for (const [url, failures] of this.sourceFailures) {
      const recent = failures.filter(f => f.timestamp > cutoff);
      if (recent.length === 0) {
        this.sourceFailures.delete(url);
      } else {
        this.sourceFailures.set(url, recent);
      }
    }
  }

  /**
   * Sort sources by provider health
   */
  sortSourcesByHealth(sources: Array<{ provider: string; url: string; quality: string }>): typeof sources {
    return sources.sort((a, b) => {
      // Deprioritize sources that recently failed
      const aFailed = this.isSourceFailed(a.url);
      const bFailed = this.isSourceFailed(b.url);
      if (aFailed && !bFailed) return 1;
      if (!aFailed && bFailed) return -1;

      // Sort by provider health score
      const aScore = this.getProviderScore(a.provider);
      const bScore = this.getProviderScore(b.provider);
      return bScore - aScore; // Higher score first
    });
  }
}

// Global singleton instance
export const providerHealth = new ProviderHealthTracker();

// Cleanup task: run every hour
const cleanupTimer = setInterval(() => {
  providerHealth.clearOldHistory();
}, 3600000);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}
