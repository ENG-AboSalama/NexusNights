import { BrowserStream } from './browser-stream';

interface ActiveStream {
  stream: BrowserStream;
  createdAt: number;
  createdBy: string;
}

/**
 * Manages server-side streaming sessions for watch parties
 * Only one stream per room (host-controlled)
 */
export class StreamManager {
  private streams = new Map<string, ActiveStream>();
  private readonly MAX_CONCURRENT_STREAMS = 5; // Resource limit
  private readonly STREAM_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

  /**
   * Start a new server-side stream for a room
   * @param roomId - Room identifier
   * @param embedUrl - Embed URL to stream (VidSrc, etc.)
   * @param hostId - User ID of the host
   * @returns HLS playlist URL
   */
  async startStream(roomId: string, embedUrl: string, hostId: string): Promise<string> {
    // Check if stream already exists
    if (this.streams.has(roomId)) {
      const existing = this.streams.get(roomId)!;
      console.log(`[StreamManager] Stream already exists for room ${roomId}`);
      return existing.stream.getHLSUrl();
    }

    // Check concurrent limit
    if (this.streams.size >= this.MAX_CONCURRENT_STREAMS) {
      throw new Error('Server streaming capacity reached. Please try again later.');
    }

    console.log(`[StreamManager] Starting stream for room ${roomId}, URL: ${embedUrl}`);

    const stream = new BrowserStream({
      url: embedUrl,
      roomId,
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      bitrate: '2500k',
    });

    try {
      const hlsUrl = await stream.start();
      
      this.streams.set(roomId, {
        stream,
        createdAt: Date.now(),
        createdBy: hostId,
      });

      // Auto-cleanup after timeout
      setTimeout(() => {
        if (this.streams.has(roomId)) {
          console.log(`[StreamManager] Auto-stopping stream ${roomId} after timeout`);
          void this.stopStream(roomId);
        }
      }, this.STREAM_TIMEOUT_MS);

      return hlsUrl;
    } catch (error) {
      console.error(`[StreamManager] Failed to start stream:`, error);
      await stream.stop();
      throw error;
    }
  }

  /**
   * Stop an active stream
   */
  async stopStream(roomId: string): Promise<boolean> {
    const active = this.streams.get(roomId);
    if (!active) {
      console.log(`[StreamManager] No stream found for room ${roomId}`);
      return false;
    }

    console.log(`[StreamManager] Stopping stream for room ${roomId}`);
    await active.stream.stop();
    this.streams.delete(roomId);
    return true;
  }

  /**
   * Get stream control interface
   */
  getStream(roomId: string): BrowserStream | null {
    const active = this.streams.get(roomId);
    return active ? active.stream : null;
  }

  /**
   * Check if room has an active stream
   */
  hasStream(roomId: string): boolean {
    return this.streams.has(roomId);
  }

  /**
   * Get all active streams info
   */
  getActiveStreams(): Array<{ roomId: string; createdAt: number; createdBy: string }> {
    return Array.from(this.streams.entries()).map(([roomId, data]) => ({
      roomId,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
    }));
  }

  /**
   * Cleanup all streams (server shutdown)
   */
  async shutdown(): Promise<void> {
    console.log(`[StreamManager] Shutting down ${this.streams.size} active streams`);
    const promises = Array.from(this.streams.keys()).map((roomId) => this.stopStream(roomId));
    await Promise.all(promises);
  }
}

// Singleton instance
export const streamManager = new StreamManager();

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('[StreamManager] SIGTERM received, shutting down streams...');
  void streamManager.shutdown().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[StreamManager] SIGINT received, shutting down streams...');
  void streamManager.shutdown().then(() => process.exit(0));
});
