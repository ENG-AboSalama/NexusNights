import type { Router } from 'express';
import { z } from 'zod';
import { streamManager } from '../streaming/stream-manager';
import type { SessionManager } from '../auth/session';

const StartStreamSchema = z.object({
  roomId: z.string().min(1).max(64),
  embedUrl: z.string().url().max(500),
});

const ControlStreamSchema = z.object({
  roomId: z.string().min(1).max(64),
  action: z.enum(['play', 'pause', 'seek', 'volume']),
  value: z.number().optional(),
});

export function attachStreamingRoutes(app: Router, sessions: SessionManager) {
  /**
   * POST /api/streaming/start
   * Start server-side streaming for a room (host only)
   */
  app.post('/api/streaming/start', async (req, res) => {
    try {
      // Verify authentication
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const payload = sessions.verifyToken(token);
      const userId = payload.userId;

      // Validate request
      const parsed = StartStreamSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error });
      }

      const { roomId, embedUrl } = parsed.data;

      // TODO: Verify user is host of the room (check room registry)
      // For now, trust the client

      console.log(`[API] Starting stream: room=${roomId}, host=${userId}`);

      // Start stream
      const hlsUrl = await streamManager.startStream(roomId, embedUrl, userId);

      res.json({
        success: true,
        hlsUrl,
        message: 'Server-side streaming started',
      });
    } catch (error) {
      console.error('[API] Stream start error:', error);
      const message = error instanceof Error ? error.message : 'Failed to start stream';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/streaming/stop
   * Stop server-side streaming (host only)
   */
  app.post('/api/streaming/stop', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const payload = sessions.verifyToken(token);
      const roomId = req.body.roomId;

      if (!roomId || typeof roomId !== 'string') {
        return res.status(400).json({ error: 'roomId required' });
      }

      console.log(`[API] Stopping stream: room=${roomId}, user=${payload.userId}`);

      const stopped = await streamManager.stopStream(roomId);

      if (!stopped) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      res.json({ success: true, message: 'Stream stopped' });
    } catch (error) {
      console.error('[API] Stream stop error:', error);
      res.status(500).json({ error: 'Failed to stop stream' });
    }
  });

  /**
   * POST /api/streaming/control
   * Control playback (host only)
   */
  app.post('/api/streaming/control', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const payload = sessions.verifyToken(token);

      const parsed = ControlStreamSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      const { roomId, action, value } = parsed.data;
      const stream = streamManager.getStream(roomId);

      if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      console.log(`[API] Stream control: room=${roomId}, action=${action}, value=${value}`);

      switch (action) {
        case 'play':
          await stream.play();
          break;
        case 'pause':
          await stream.pause();
          break;
        case 'seek':
          if (value !== undefined) {
            await stream.seek(value);
          }
          break;
        case 'volume':
          if (value !== undefined) {
            await stream.setVolume(value);
          }
          break;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[API] Stream control error:', error);
      res.status(500).json({ error: 'Control command failed' });
    }
  });

  /**
   * GET /api/streaming/status/:roomId
   * Check if room has active stream
   */
  app.get('/api/streaming/status/:roomId', (req, res) => {
    const { roomId } = req.params;
    const hasStream = streamManager.hasStream(roomId);
    
    if (!hasStream) {
      return res.json({ active: false });
    }

    const stream = streamManager.getStream(roomId);
    const status = stream?.getStatus();

    res.json({
      active: true,
      status,
      hlsUrl: stream?.getHLSUrl(),
    });
  });

  /**
   * GET /api/streaming/active
   * Get all active streams (admin only)
   */
  app.get('/api/streaming/active', (req, res) => {
    // TODO: Add admin authentication check
    const streams = streamManager.getActiveStreams();
    res.json({ streams, count: streams.length });
  });
}
