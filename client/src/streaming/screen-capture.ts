/**
 * Video Element Capture - Captures only the <video> element from embed player
 * This gives clean video without ads/UI!
 */

export interface VideoCaptureOptions {
  roomId: string;
  videoElement?: HTMLVideoElement; // Optional: pass existing video element
  onStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
}

export class VideoCapture {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasStream: MediaStream | null = null;
  private animationFrame: number | null = null;
  private audioContext: AudioContext | null = null;
  private roomId: string;

  constructor(private options: VideoCaptureOptions) {
    this.roomId = options.roomId;
    this.videoElement = options.videoElement || null;
  }

  /**
   * Find video element in current page (including iframes)
   */
  private async findVideoElement(): Promise<HTMLVideoElement> {
    console.log('[VideoCapture] Searching for video element...');

    // Try main document first
    let video = document.querySelector('video');
    
    if (video && video.readyState >= 2) {
      console.log('[VideoCapture] ✓ Found video in main document');
      return video;
    }

    // Search in iframes
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      try {
        const iframe = iframes[i];
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          video = iframeDoc.querySelector('video');
          if (video && video.readyState >= 2) {
            console.log(`[VideoCapture] ✓ Found video in iframe ${i}`);
            return video;
          }
        }
      } catch (err) {
        // Cross-origin iframe - can't access
        console.log(`[VideoCapture] Can't access iframe ${i} (cross-origin)`);
      }
    }

    throw new Error('لم يتم العثور على فيديو في الصفحة. تأكد من تشغيل الفيديو أولاً.');
  }

  /**
   * Start capturing video element only
   */
  async start(): Promise<MediaStream> {
    try {
      console.log('[VideoCapture] Starting video capture...');

      // Find video element
      if (!this.videoElement) {
        this.videoElement = await this.findVideoElement();
      }

      if (!this.videoElement) {
        throw new Error('No video element found');
      }

      console.log('[VideoCapture] Video element found:', {
        src: this.videoElement.src,
        width: this.videoElement.videoWidth,
        height: this.videoElement.videoHeight,
        duration: this.videoElement.duration,
        paused: this.videoElement.paused,
      });

      // Method 1: Try captureStream() (works for same-origin videos)
      try {
        // @ts-ignore - captureStream is available on HTMLVideoElement
        const videoStream = this.videoElement.captureStream ? this.videoElement.captureStream() : this.videoElement.mozCaptureStream?.();
        
        if (videoStream) {
          console.log('[VideoCapture] ✓ Using native captureStream()');
          this.stream = videoStream;
          
          if (this.options.onStream && this.stream) {
            this.options.onStream(this.stream);
          }
          
          return this.stream as MediaStream;
        }
      } catch (err) {
        console.log('[VideoCapture] captureStream() failed, falling back to canvas method');
      }

      // Method 2: Canvas capture (works for cross-origin with CORS)
      return await this.startCanvasCapture();

    } catch (error) {
      const err = error as Error;
      console.error('[VideoCapture] Failed to start:', err);
      
      if (this.options.onError) {
        this.options.onError(err);
      }
      
      throw err;
    }
  }

  /**
   * Capture video using canvas (works for most cases)
   */
  private async startCanvasCapture(): Promise<MediaStream> {
    if (!this.videoElement) {
      throw new Error('No video element');
    }

    console.log('[VideoCapture] Starting canvas capture...');

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.videoElement.videoWidth || 1920;
    this.canvas.height = this.videoElement.videoHeight || 1080;
    
    const ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }

    // Start drawing video frames to canvas
    const drawFrame = () => {
      if (!this.videoElement || !this.canvas || !ctx) return;

      try {
        ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
      } catch (err) {
        console.error('[VideoCapture] Frame draw error:', err);
      }

      this.animationFrame = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    // Capture canvas as stream
    this.canvasStream = this.canvas.captureStream(30); // 30 FPS

    // Try to capture audio from video element
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaElementSource(this.videoElement);
      const destination = this.audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.connect(this.audioContext.destination); // Also play locally

      // Add audio track to stream
      const audioTracks = destination.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.canvasStream.addTrack(audioTracks[0]);
        console.log('[VideoCapture] ✓ Audio captured');
      }
    } catch (err) {
      console.warn('[VideoCapture] Audio capture failed:', err);
    }

    this.stream = this.canvasStream;

    console.log('[VideoCapture] ✓ Canvas capture started');

    if (this.options.onStream) {
      this.options.onStream(this.stream);
    }

    return this.stream;
  }

  /**
   * Stop video capture
   */
  stop(): void {
    console.log('[VideoCapture] Stopping...');

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach(track => track.stop());
      this.canvasStream = null;
    }

    this.canvas = null;
    this.videoElement = null;
  }

  /**
   * Get current stream
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Check if browser supports video capture
   */
  static isSupported(): boolean {
    // @ts-ignore - captureStream exists but not in types
    return !!(HTMLVideoElement.prototype.captureStream || 
              // @ts-ignore
              HTMLVideoElement.prototype.mozCaptureStream ||
              HTMLCanvasElement.prototype.captureStream);
  }
}
