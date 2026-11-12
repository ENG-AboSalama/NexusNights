import { BASE } from './api';

export interface StartStreamRequest {
  roomId: string;
  embedUrl: string;
}

export interface StartStreamResponse {
  success: boolean;
  hlsUrl: string;
  message: string;
}

export interface StreamStatus {
  active: boolean;
  status?: {
    isActive: boolean;
    url: string;
  };
  hlsUrl?: string;
}

/**
 * Start server-side streaming for a room
 * This will launch Puppeteer + FFmpeg on the server
 */
export async function startServerStream(
  roomId: string,
  embedUrl: string,
  signal?: AbortSignal
): Promise<StartStreamResponse> {
  const token = localStorage.getItem('nexusnight_token');
  if (!token) throw new Error('Authentication required');

  const res = await fetch(BASE + '/api/streaming/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ roomId, embedUrl }),
    signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to start stream' }));
    throw new Error(error.error || 'Failed to start stream');
  }

  return res.json();
}

/**
 * Stop server-side streaming
 */
export async function stopServerStream(roomId: string): Promise<{ success: boolean }> {
  const token = localStorage.getItem('nexusnight_token');
  if (!token) throw new Error('Authentication required');

  const res = await fetch(BASE + '/api/streaming/stop', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ roomId }),
  });

  if (!res.ok) {
    throw new Error('Failed to stop stream');
  }

  return res.json();
}

/**
 * Control server-side stream playback
 */
export async function controlServerStream(
  roomId: string,
  action: 'play' | 'pause' | 'seek' | 'volume',
  value?: number
): Promise<{ success: boolean }> {
  const token = localStorage.getItem('nexusnight_token');
  if (!token) throw new Error('Authentication required');

  const res = await fetch(BASE + '/api/streaming/control', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ roomId, action, value }),
  });

  if (!res.ok) {
    throw new Error('Control command failed');
  }

  return res.json();
}

/**
 * Check if room has active server stream
 */
export async function getStreamStatus(roomId: string, signal?: AbortSignal): Promise<StreamStatus> {
  const res = await fetch(BASE + `/api/streaming/status/${roomId}`, { signal });
  
  if (!res.ok) {
    throw new Error('Failed to get stream status');
  }

  return res.json();
}
