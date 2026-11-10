import { api } from '../api';
import { getToken } from '../auth/AuthContext';

export interface RoomInfo {
  id: string;
  hostId: string;
  hostName: string;
  title: string;
  mediaId: string;
  isPublic?: boolean;
  createdAt?: number;
}

export interface CreateRoomRequest {
  mediaId: string;
  title: string;
  isPublic?: boolean;
}

export interface CreateRoomResponse {
  room: {
    id: string;
    inviteCode: string;
    inviteUrl: string;
  };
}

/**
 * Room API client
 */
export const roomApi = {
  /**
   * Create a new watch party room
   */
  async create(req: CreateRoomRequest): Promise<CreateRoomResponse> {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/rooms/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }));
      throw new Error(error.error || 'Failed to create room');
    }

    return response.json();
  },

  /**
   * Get room details by ID
   */
  async get(roomId: string): Promise<{ room: RoomInfo }> {
    const response = await fetch(`/api/rooms/${roomId}`);
    if (!response.ok) {
      throw new Error('Room not found');
    }
    return response.json();
  },

  /**
   * Resolve an invite code to room details
   */
  async resolveInvite(code: string): Promise<{ room: RoomInfo }> {
    const response = await fetch(`/api/rooms/invite/${code}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }));
      if (response.status === 410) throw new Error('Invite expired');
      throw new Error(error.error || 'Invite not found');
    }
    return response.json();
  },

  /**
   * Close a room (host only)
   */
  async close(roomId: string): Promise<void> {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`/api/rooms/${roomId}/close`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }));
      throw new Error(error.error || 'Failed to close room');
    }
  },

  /**
   * Discover public rooms
   */
  async discover(): Promise<{ rooms: RoomInfo[] }> {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/rooms/discover', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to discover rooms');
    }

    return response.json();
  },

  /**
   * Transfer host to another user
   */
  async transfer(roomId: string, newHostId: string): Promise<void> {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`/api/rooms/${roomId}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ newHostId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }));
      throw new Error(error.error || 'Failed to transfer host');
    }
  },
};
