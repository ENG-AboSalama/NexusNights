/**
 * WebSocket-based Screen Streaming
 * Simpler alternative to WebRTC - sends video chunks via WebSocket
 */

export interface WebSocketStreamerOptions {
  roomId: string;
  stream: MediaStream;
  serverUrl?: string;
}

export class WebSocketStreamer {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private roomId: string;
  private stream: MediaStream;
  private isStreaming = false;

  constructor(private options: WebSocketStreamerOptions) {
    this.roomId = options.roomId;
    this.stream = options.stream;
  }

  /**
   * Start streaming to server via WebSocket
   */
  async start(authToken: string): Promise<void> {
    try {
      console.log('[WebSocketStreamer] Starting stream for room:', this.roomId);

      // Connect to WebSocket endpoint
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/stream/${this.roomId}?token=${authToken}`;
      
      console.log('[WebSocketStreamer] Connecting to:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        if (!this.ws) {
          reject(new Error('WebSocket not initialized'));
          return;
        }

        this.ws.onopen = () => {
          console.log('[WebSocketStreamer] ✓ WebSocket connected successfully');
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('[WebSocketStreamer] ✗ WebSocket connection error:', error);
          reject(new Error('Failed to connect to streaming server'));
        };

        this.ws.onclose = (event) => {
          console.log('[WebSocketStreamer] WebSocket closed:', event.code, event.reason);
          this.stop();
        };
        
        this.ws.onmessage = (event) => {
          console.log('[WebSocketStreamer] Message from server:', event.data);
        };
      });

      // Determine supported mimeType
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('video/webm')) {
            mimeType = 'video/webm';
          }
        }
      }

      // Start MediaRecorder to capture stream with high bitrate & quality
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 6000000, // 6 Mbps for crisp 1080p
        audioBitsPerSecond: 192000, // 192 kbps studio audio
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            const buffer = await event.data.arrayBuffer();
            this.ws.send(buffer);
          } catch (err) {
            console.warn('[WebSocketStreamer] Failed to send buffer:', err);
          }
        }
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('[WebSocketStreamer] MediaRecorder error:', error);
      };

      // Start recording with 1000ms timeslice to ensure complete Opus audio frames and clean WebM clusters
      this.mediaRecorder.start(1000);
      this.isStreaming = true;

      console.log('[WebSocketStreamer] Streaming started');

    } catch (error) {
      console.error('[WebSocketStreamer] Failed to start:', error);
      this.stop();
      throw error;
    }
  }

  /**
   * Stop streaming
   */
  stop(): void {
    console.log('[WebSocketStreamer] Stopping stream...');
    
    this.isStreaming = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if currently streaming
   */
  isActive(): boolean {
    return this.isStreaming;
  }
}
