/**
 * Unified Multi-Provider Streaming Types
 * Architecture for independent provider adapters, health tracking, and playback orchestration.
 */

export type MediaKind = 'movie' | 'series';
export type StreamSourceType = 'embed' | 'hls' | 'mp4';

export interface ProviderMediaRequest {
  tmdbId: number;
  imdbId?: string;
  kind: MediaKind;
  season?: number;
  episode?: number;
}

export interface ProviderSource {
  id: string;
  url: string;
  type: StreamSourceType;
  embedUrl?: string; // Present when type === 'embed'
  quality: string;
  providerId: string;
  providerName: string;
  isEmbed: boolean;
  priority: number;
  audioTracks?: Array<{ language: string; label: string }>;
}

export interface ProviderResult {
  providerId: string;
  providerName: string;
  isSupported: boolean;
  sources: ProviderSource[];
  diagnostics: string[];
}

export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly isSupported: boolean;
  readonly supportedTypes: readonly MediaKind[];
  readonly basePriority: number;
  resolve(req: ProviderMediaRequest): Promise<ProviderResult>;
  healthCheck?(): Promise<boolean>;
}

export interface PlaybackSource {
  url: string;
  type: StreamSourceType;
  embedUrl?: string; // Present when type === 'embed'
  quality: string;
  provider: string;
  isEmbed: boolean;
  audioTracks?: Array<{ language: string; label: string }>;
}

export interface PlaybackSubtitle {
  url: string;
  language: string;
  label: string;
}

export interface PlaybackDiagnostic {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface PlaybackConfig {
  source: PlaybackSource | null;
  alternatives: PlaybackSource[];
  subtitles: PlaybackSubtitle[];
  canAutoSwitch: boolean;
  diagnostics: PlaybackDiagnostic[];
}

export interface PlaybackConfigPublic {
  source: PlaybackSource | null;
  alternatives: PlaybackSource[];
  subtitles: PlaybackSubtitle[];
  canAutoSwitch: boolean;
  hasLocal: boolean;
  localMediaId: string | null;
  diagnosticsCount: number;
}

export interface ProviderStatusInfo {
  id: string;
  name: string;
  description: string;
  isSupported: boolean;
  isEnabled: boolean;
  basePriority: number;
  supportedTypes: readonly MediaKind[];
  inCooldown: boolean;
  healthScore: number;
  totalAttempts: number;
  successfulAttempts: number;
  successRate: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  unsupportedReason?: string;
}

export interface ProviderTestResult {
  providerId: string;
  providerName: string;
  success: boolean;
  durationMs: number;
  sourceCount: number;
  sources: ProviderSource[];
  diagnostics: string[];
  error?: string;
}
