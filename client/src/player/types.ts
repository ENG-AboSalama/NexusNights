/**
 * Client-side Playback Types
 * 
 * Types for the playback orchestration system.
 */

export type PlaybackType = 'iframe_embed' | 'direct_url' | 'hls_stream' | 'unknown';

export interface PlaybackSource {
  sourceId: string;
  providerId: string;
  providerName: string;
  contentId?: string;
  titleId: string;
  season?: number;
  episode?: number;
  
  playbackType: PlaybackType;
  embedUrl: string;
  
  // Quality information
  supportedQuality: string;
  supportedFormats: string[];
  
  // Status
  verificationStatus: string;
  availabilityStatus: string;
  
  lastVerifiedAt: string;
  
  // Additional metadata
  metadata: {
    sourceId?: string;
    audioLanguage?: string;
    subtitleLanguages?: string[];
  };
}

export interface ResolvePlaybackResponse {
  success: boolean;
  source?: PlaybackSource;
  error?: string;
  fallbackAvailable: boolean;
}