/**
 * External Playback Hook
 * 
 * Provides automatic source selection and failover functionality
 * for external media providers.
 */

import { useState, useCallback, useRef } from 'react';
import { u } from '../api';
import type { PlaybackSource } from './types';

interface UseExternalPlaybackOptions {
  titleId: string;
  season?: number;
  episode?: number;
  autoPlay?: boolean;
  onReady?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

interface UseExternalPlaybackReturn {
  currentSource: PlaybackSource | null;
  isLoading: boolean;
  error: string | null;
  hasFallback: boolean;
  retry: () => Promise<void>;
}

export function useExternalPlayback(options: UseExternalPlaybackOptions): UseExternalPlaybackReturn {
  const { titleId, season, episode, onReady, onEnded, onError } = options;
  
  const [currentSource, setCurrentSource] = useState<PlaybackSource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFallback, setHasFallback] = useState(false);
  
  const abortRef = useRef<AbortController>();
  
  const resolveSource = useCallback(async () => {
    // Cancel any pending request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        titleId
      });
      
      if (season !== undefined) params.set('season', String(season));
      if (episode !== undefined) params.set('episode', String(episode));
      
      const res = await fetch(u(`/api/playback/resolve?${params}`), {
        signal: abortRef.current.signal,
        headers: { accept: 'application/json' }
      });
      
      if (!res.ok) {
        throw new Error('Failed to resolve playback source');
      }
      
      const data = await res.json();
      
      if (data.success && data.source) {
        setCurrentSource(data.source);
        setHasFallback(data.fallbackAvailable);
        onReady?.();
      } else {
        setError(data.error || 'no_available_source');
        setHasFallback(data.fallbackAvailable);
        onError?.(data.error || 'no_source');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('network_error');
        onError?.('network_error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [titleId, season, episode, onReady, onError]);
  
  // Handle fallback when source fails
  const handleFallback = useCallback(async (newSource: PlaybackSource) => {
    setCurrentSource(newSource);
    setError(null);
    onReady?.();
  }, [onReady]);
  
  // Retry with fallback
  const retry = useCallback(async () => {
    // If we have a current source and fallback is available, try fallback first
    if (currentSource && hasFallback) {
      try {
        const res = await fetch(u('/api/playback/failure'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sourceId: currentSource.sourceId, 
            errorType: 'startup' 
          })
        });
        
        const data = await res.json();
        
        if (data.fallback) {
          handleFallback(data.fallback);
          return;
        }
      } catch {
        // Fall through to normal retry
      }
    }
    
    // Normal retry - resolve again
    await resolveSource();
  }, [currentSource, hasFallback, resolveSource, handleFallback]);
  
  return {
    currentSource,
    isLoading,
    error,
    hasFallback,
    retry
  };
}

/**
 * Hook to report playback events to the backend
 */
export function usePlaybackTelemetry() {
  const reportSuccess = useCallback(async (sourceId: string) => {
    try {
      await fetch(u('/api/playback/success'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId })
      });
    } catch {
      // Silent fail
    }
  }, []);
  
  const reportFailure = useCallback(async (sourceId: string, errorType: string = 'playback') => {
    try {
      const res = await fetch(u('/api/playback/failure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, errorType })
      });
      
      const data = await res.json();
      return data.fallback;
    } catch {
      return null;
    }
  }, []);
  
  return { reportSuccess, reportFailure };
}