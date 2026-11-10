import type { Express } from 'express';
import type { SessionManager } from '../auth/session';
import { roomRegistry } from '../realtime/room-registry';

/**
 * Room management endpoints for watch parties
 */
export function registerRoomRoutes(app: Express, sessions: SessionManager) {
  
  /**
   * POST /api/rooms/create
   * Create a new watch party room
   */
  app.post('/api/rooms/create', async (req, res) => {
    const token = sessions.extractToken(req.get('authorization'));
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    try {
      const user = sessions.verifyToken(token);
      const { mediaId, title, isPublic = true } = req.body;

      if (!mediaId || !title) {
        return res.status(400).json({ error: 'missing_required_fields' });
      }

      const room = roomRegistry.createRoom({
        hostId: user.userId,
        hostName: user.globalName || user.username,
        title,
        mediaId,
        isPublic,
      });

      return res.json({
        room: {
          id: room.id,
          inviteCode: room.inviteCode,
          inviteUrl: `/#/watch/${room.mediaId}?room=${room.id}`,
        },
      });
    } catch (error) {
      console.error('[Room] Create failed:', error);
      return res.status(401).json({ error: 'unauthorized' });
    }
  });

  /**
   * GET /api/rooms/:roomId
   * Get room details
   */
  app.get('/api/rooms/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const room = roomRegistry.getRoom(roomId);

    if (!room) {
      return res.status(404).json({ error: 'room_not_found' });
    }

    return res.json({
      room: {
        id: room.id,
        hostId: room.hostId,
        hostName: room.hostName,
        title: room.title,
        mediaId: room.mediaId,
        isPublic: room.isPublic,
        inviteCode: room.inviteCode,
        started: !!room.started,
      },
    });
  });

  /**
   * GET /api/rooms/invite/:code
   * Resolve an invite code to room details
   */
  app.get('/api/rooms/invite/:code', async (req, res) => {
    const { code } = req.params;
    const room = roomRegistry.resolveInvite(code);

    if (!room) {
      return res.status(404).json({ error: 'invite_not_found' });
    }

    return res.json({
      room: {
        id: room.id,
        hostId: room.hostId,
        hostName: room.hostName,
        title: room.title,
        mediaId: room.mediaId,
        inviteCode: room.inviteCode,
      },
    });
  });

  /**
   * POST /api/rooms/:roomId/close
   * Close a room (host only)
   */
  app.post('/api/rooms/:roomId/close', async (req, res) => {
    const token = sessions.extractToken(req.get('authorization'));
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    try {
      const user = sessions.verifyToken(token);
      const { roomId } = req.params;
      const room = roomRegistry.getRoom(roomId);

      if (!room) {
        return res.status(404).json({ error: 'room_not_found' });
      }

      if (room.hostId !== user.userId) {
        return res.status(403).json({ error: 'not_host' });
      }

      roomRegistry.closeRoom(roomId);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Room] Close failed:', error);
      return res.status(401).json({ error: 'unauthorized' });
    }
  });

  /**
   * GET /api/rooms/discover
   * Discover public rooms
   */
  app.get('/api/rooms/discover', async (req, res) => {
    const token = sessions.extractToken(req.get('authorization'));
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    try {
      sessions.verifyToken(token);
      
      const publicRooms = roomRegistry.listPublicRooms().map((r) => ({
        id: r.id,
        hostName: r.hostName,
        title: r.title,
        mediaId: r.mediaId,
        createdAt: r.createdAt,
        inviteCode: r.inviteCode,
      }));

      return res.json({ rooms: publicRooms });
    } catch (error) {
      console.error('[Room] Discover failed:', error);
      return res.status(401).json({ error: 'unauthorized' });
    }
  });

  /**
   * POST /api/rooms/:roomId/transfer
   * Transfer host to another user
   */
  app.post('/api/rooms/:roomId/transfer', async (req, res) => {
    const token = sessions.extractToken(req.get('authorization'));
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    try {
      const user = sessions.verifyToken(token);
      const { roomId } = req.params;
      const { newHostId, newHostName } = req.body;

      if (!newHostId) {
        return res.status(400).json({ error: 'missing_new_host_id' });
      }

      const room = roomRegistry.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'room_not_found' });
      }

      if (room.hostId !== user.userId) {
        return res.status(403).json({ error: 'not_host' });
      }

      roomRegistry.transferHost(roomId, newHostId, newHostName);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Room] Transfer failed:', error);
      return res.status(401).json({ error: 'unauthorized' });
    }
  });
}
