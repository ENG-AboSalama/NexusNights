import fs from 'node:fs';
import path from 'node:path';
import type { ProviderAdapter, ProviderMediaRequest, ProviderStatusInfo, ProviderTestResult } from './types';
import { VixSrcAdapter } from './adapters/vixsrc-adapter';
import { VidSrcMovAdapter } from './adapters/vidsrc-mov-adapter';
import { VidApiAdapter } from './adapters/vidapi-adapter';
import { VidRockAdapter } from './adapters/vidrock-adapter';
import { providerHealth } from './provider-health';

export class ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();
  private disabledProviders = new Set<string>();
  private persistPath: string | null = null;

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults() {
    this.register(new VidSrcMovAdapter()); // Primary
    this.register(new VixSrcAdapter());    // Fallback
    this.register(new VidApiAdapter());
    this.register(new VidRockAdapter());
  }

  initPersistence(filePath: string): void {
    this.persistPath = filePath;
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.disabled)) {
          this.disabledProviders = new Set(parsed.disabled.map((s: string) => String(s).toLowerCase()));
          console.log(`[ProviderRegistry] Loaded state from ${filePath}: ${this.disabledProviders.size} disabled provider(s)`);
        }
      }
    } catch (e) {
      console.warn('[ProviderRegistry] Could not load persisted state:', e);
    }
  }

  private savePersistence(): void {
    if (!this.persistPath) return;
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.persistPath,
        JSON.stringify({ disabled: Array.from(this.disabledProviders) }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.warn('[ProviderRegistry] Could not save persisted state:', e);
    }
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id.toLowerCase(), adapter);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id.toLowerCase());
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getSupported(): ProviderAdapter[] {
    return this.getAll().filter((a) => a.isSupported);
  }

  isEnabled(id: string): boolean {
    return !this.disabledProviders.has(id.toLowerCase());
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const key = id.toLowerCase();
    if (enabled) {
      this.disabledProviders.delete(key);
    } else {
      this.disabledProviders.add(key);
    }
    this.savePersistence();
    return this.isEnabled(key);
  }

  /**
   * Returns all providers that are both technically supported AND currently enabled by user
   */
  getActive(): ProviderAdapter[] {
    return this.getSupported().filter((a) => this.isEnabled(a.id));
  }

  getStatuses(): ProviderStatusInfo[] {
    const all = this.getAll();
    return all.map((adapter) => {
      const stats = providerHealth.getStats(adapter.id);
      const inCooldown = providerHealth.isProviderInCooldown(adapter.id);
      const healthScore = Math.round(providerHealth.getProviderScore(adapter.id) * 100);
      const total = stats?.totalAttempts || 0;
      const success = stats?.successfulAttempts || 0;
      const rate = total > 0 ? `${((success / total) * 100).toFixed(1)}%` : 'N/A';

      let description = '';
      let unsupportedReason: string | undefined = undefined;

      if (adapter.id === 'vidsrc-mov') {
        description = 'Primary fast embed provider with automatic multi-mirror fallback';
      } else if (adapter.id === 'vixsrc') {
        description = 'Fallback 1080p stream embed with comprehensive catalog & direct resolution';
      } else if (adapter.id === 'vidapi') {
        description = 'Tertiary clean embed provider with smooth playback stability';
      } else if (adapter.id === 'vidrock') {
        description = 'Protected provider without authorized public API or open embed';
        unsupportedReason = 'No authorized open developer API or embed available';
      } else {
        description = `Streaming provider (${adapter.name})`;
      }

      return {
        id: adapter.id,
        name: adapter.name,
        description,
        isSupported: adapter.isSupported,
        isEnabled: this.isEnabled(adapter.id),
        basePriority: adapter.basePriority,
        supportedTypes: adapter.supportedTypes,
        inCooldown,
        healthScore,
        totalAttempts: total,
        successfulAttempts: success,
        successRate: rate,
        lastSuccess: stats?.lastSuccess ? new Date(stats.lastSuccess).toISOString() : null,
        lastFailure: stats?.lastFailure ? new Date(stats.lastFailure).toISOString() : null,
        unsupportedReason,
      };
    });
  }

  async testProvider(
    id: string,
    req: ProviderMediaRequest = { kind: 'movie', tmdbId: 1368337 }
  ): Promise<ProviderTestResult> {
    const adapter = this.get(id);
    if (!adapter) {
      return {
        providerId: id,
        providerName: id,
        success: false,
        durationMs: 0,
        sourceCount: 0,
        sources: [],
        diagnostics: [`Provider '${id}' not registered`],
        error: 'provider_not_found',
      };
    }

    const start = Date.now();
    try {
      const res = await Promise.race([
        adapter.resolve(req),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Provider test timed out (6000ms)')), 6000)
        ),
      ]);
      const durationMs = Date.now() - start;
      const success = res.sources.length > 0;
      return {
        providerId: adapter.id,
        providerName: adapter.name,
        success,
        durationMs,
        sourceCount: res.sources.length,
        sources: res.sources,
        diagnostics: res.diagnostics,
      };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      return {
        providerId: adapter.id,
        providerName: adapter.name,
        success: false,
        durationMs,
        sourceCount: 0,
        sources: [],
        diagnostics: [err.message || 'Unknown error during provider test'],
        error: err.message,
      };
    }
  }

  async checkHealth(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const adapter of this.getSupported()) {
      results[adapter.id] = adapter.healthCheck ? await adapter.healthCheck() : true;
    }
    return results;
  }
}

// Global singleton instance
export const providerRegistry = new ProviderRegistry();
