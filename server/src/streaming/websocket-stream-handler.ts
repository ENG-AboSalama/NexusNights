/**
 * WebSocket Stream Handler
 * Receives video chunks from host's screen share and converts to HLS
 */

import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { WebSocket } from 'ws';
import { ROOT } from '../config';

export class WebSocketStreamHandler {
  private ffmpegProcess: ChildProcess | null = null;
  private hlsPath: string;
  private isActive = false;
  private frameCount = 0;
  private roomId: string;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.hlsPath = path.resolve(ROOT, 'data', 'hls', this.roomId);
    
    // Create HLS directory
    if (!fs.existsSync(this.hlsPath)) {
      fs.mkdirSync(this.hlsPath, { recursive: true });
    }
  }

  /**
   * Start receiving WebM chunks and converting to HLS
   */
  start(ws: WebSocket): void {
    console.log(`[WebSocketStreamHandler] Starting for room ${this.roomId}`);
    
    // Start FFmpeg to convert WebM to HLS
    this.startFFmpeg();
    this.isActive = true;

    // Handle incoming video chunks
    ws.on('message', (data: Buffer) => {
      if (this.ffmpegProcess && this.ffmpegProcess.stdin && !this.ffmpegProcess.stdin.destroyed) {
        try {
          this.ffmpegProcess.stdin.write(data);
          this.frameCount++;
          
          if (this.frameCount % 30 === 0) {
            console.log(`[WebSocketStreamHandler] Received ${this.frameCount} chunks`);
          }
        } catch (err) {
          console.error('[WebSocketStreamHandler] Error writing to FFmpeg:', err);
        }
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocketStreamHandler] WebSocket closed`);
      this.stop();
    });

    ws.on('error', (err) => {
      console.error('[WebSocketStreamHandler] WebSocket error:', err);
      this.stop();
    });
  }

  /**
   * Start FFmpeg process to convert WebM stream to HLS
   */
  private startFFmpeg(): void {
    const playlistPath = path.join(this.hlsPath, 'index.m3u8').replace(/\\/g, '/');
    const segmentPath = path.join(this.hlsPath, 'segment%03d.ts').replace(/\\/g, '/');

    const ffmpegArgs = [
      // Input from stdin (WebM stream)
      '-loglevel', 'warning',
      '-fflags', '+nobuffer+discardcorrupt',
      '-flags', 'low_delay',
      '-f', 'webm',
      '-i', 'pipe:0',
      
      // Video settings: high quality 1080p, ultra-low latency, zero frame delay
      '-map', '0:v:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-g', '30',
      '-b:v', '4500k',
      '-maxrate', '6000k',
      '-bufsize', '5000k',
      
      // Audio settings: clean 192kbps AAC at native 48kHz, NO artificial aresample stretching
      '-map', '0:a?',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      
      // HLS settings for ultra-low latency live streaming (1s chunks)
      '-f', 'hls',
      '-hls_time', '1',
      '-hls_list_size', '5',
      '-hls_flags', 'delete_segments+append_list+omit_endlist+temp_file+split_by_time',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', segmentPath,
      '-start_number', '0',
      playlistPath,
    ];

    console.log(`[WebSocketStreamHandler] Starting FFmpeg with args:`, ffmpegArgs.join(' '));

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.ffmpegProcess.stdin) {
      console.error('[WebSocketStreamHandler] Failed to get FFmpeg stdin pipe');
      return;
    }

    this.ffmpegProcess.stdin.on('error', (err) => {
      console.warn('[WebSocketStreamHandler] FFmpeg stdin error:', err.message);
    });

    this.ffmpegProcess.stdout?.on('data', (data) => {
      console.log(`[FFmpeg STDOUT] ${data.toString().trim()}`);
    });

    this.ffmpegProcess.stderr?.on('data', (data) => {
      const log = data.toString();
      // Only log important FFmpeg messages
      if (log.includes('error') || log.includes('Error') || log.includes('failed') || 
          (!log.includes('frame=') && !log.includes('time=') && !log.includes('speed='))) {
        console.log(`[FFmpeg] ${log.trim()}`);
      }
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error(`[FFmpeg] Process error:`, err);
    });

    this.ffmpegProcess.on('exit', (code, signal) => {
      console.log(`[FFmpeg] Process exited with code ${code}, signal ${signal}`);
      this.isActive = false;
    });
    
    console.log(`[WebSocketStreamHandler] FFmpeg process started (PID: ${this.ffmpegProcess.pid})`);
  }

  /**
   * Stop processing and cleanup
   */
  stop(): void {
    console.log(`[WebSocketStreamHandler] Stopping for room ${this.roomId}`);
    
    this.isActive = false;

    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.stdin?.end();
        this.ffmpegProcess.kill('SIGTERM');
      } catch (err) {
        console.error('[WebSocketStreamHandler] Error stopping FFmpeg:', err);
      }
      this.ffmpegProcess = null;
    }

    // Clean up HLS files after delay
    setTimeout(() => {
      if (fs.existsSync(this.hlsPath)) {
        try {
          fs.rmSync(this.hlsPath, { recursive: true, force: true });
          console.log(`[WebSocketStreamHandler] Cleaned up HLS files for ${this.roomId}`);
        } catch (err) {
          console.error('[WebSocketStreamHandler] Error cleaning up:', err);
        }
      }
    }, 5000);

    console.log(`[WebSocketStreamHandler] Stopped. Total chunks: ${this.frameCount}`);
  }

  getHLSUrl(): string {
    return `/hls/${this.roomId}/index.m3u8`;
  }

  getStatus(): { isActive: boolean; frameCount: number; hlsUrl: string } {
    return {
      isActive: this.isActive,
      frameCount: this.frameCount,
      hlsUrl: this.getHLSUrl(),
    };
  }
}
