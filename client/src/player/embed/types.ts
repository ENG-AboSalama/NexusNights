/**
 * Universal Embed & Player.js Protocol Architecture Types
 * NEXUSNIGHT Player.js Compatibility POC
 */

export type EmbedProtocol = 'playerjs' | 'custom-postmessage' | 'opaque-embed' | 'unsupported';

export interface EmbedPlayerCapabilities {
  /** Can play via protocol */
  play: boolean;
  /** Can pause via protocol */
  pause: boolean;
  /** Can seek to position via protocol */
  seek: boolean;
  /** Can adjust volume via protocol */
  volume: boolean;
  /** Can mute/unmute via protocol */
  mute: boolean;
  /** Reports current time progress events */
  timeupdate: boolean;
  /** Reports total duration */
  duration: boolean;
  /** Reports playback ended */
  ended: boolean;
  /** Reports error events */
  error: boolean;
  /** Supports subtitle / caption track selection (Player.js spec does NOT standardise text tracks) */
  captions: boolean;
  /** Supports playback speed adjustment */
  playbackRate: boolean;
}

export interface ProviderCompatibilityReport {
  id: string;
  name: string;
  embedUrlPattern: string;
  protocol: EmbedProtocol;
  implementsPlayerJs: boolean;
  handshakeResponse: boolean;
  capabilities: EmbedPlayerCapabilities;
  documentedSdk: string | null;
  limitations: string[];
  recommendation: string;
}

export interface EmbedPlayerState {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  capabilities: EmbedPlayerCapabilities;
  lastEvent: string | null;
  eventLog: Array<{ timestamp: number; type: string; details?: unknown }>;
  error: string | null;
}
