import crypto from 'node:crypto';

export interface RoomMeta {
  id: string;
  hostId: string;
  hostName: string;
  title: string;
  mediaId: string;
  createdAt: number;
  isPublic: boolean;
  inviteCode: string;
  started?: boolean;
}

export interface RoomInvite {
  code: string;
  roomId: string;
  createdBy: string;
  expiresAt: number;
}

/**
 * Shared in-memory registry for watch party rooms and short invite codes.
 * Ensures realtime Socket.IO and HTTP REST routes share the exact same room state and designated host.
 */
class RoomRegistryStore {
  private rooms = new Map<string, RoomMeta>();
  private invites = new Map<string, RoomInvite>();

  generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  generateRoomId(): string {
    return `room-${crypto.randomBytes(8).toString('hex')}`;
  }

  createRoom(params: {
    hostId: string;
    hostName: string;
    title: string;
    mediaId: string;
    isPublic?: boolean;
  }): RoomMeta {
    const roomId = this.generateRoomId();
    let inviteCode = this.generateInviteCode();
    while (this.invites.has(inviteCode)) {
      inviteCode = this.generateInviteCode();
    }

    const room: RoomMeta = {
      id: roomId,
      hostId: params.hostId,
      hostName: params.hostName,
      title: params.title,
      mediaId: params.mediaId,
      createdAt: Date.now(),
      isPublic: params.isPublic ?? true,
      inviteCode,
      started: false,
    };

    this.rooms.set(roomId, room);

    this.invites.set(inviteCode, {
      code: inviteCode,
      roomId,
      createdBy: params.hostId,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    return room;
  }

  getRoom(roomId: string): RoomMeta | undefined {
    return this.rooms.get(roomId);
  }

  setStarted(roomId: string, started = true): void {
    const r = this.rooms.get(roomId);
    if (r) r.started = started;
  }

  transferHost(roomId: string, newHostId: string, newHostName?: string): boolean {
    const r = this.rooms.get(roomId);
    if (!r) return false;
    r.hostId = newHostId;
    if (newHostName) r.hostName = newHostName;
    return true;
  }

  resolveInvite(code: string): RoomMeta | null {
    const invite = this.invites.get(code.toUpperCase());
    if (!invite) return null;
    if (Date.now() > invite.expiresAt) {
      this.invites.delete(code.toUpperCase());
      return null;
    }
    return this.rooms.get(invite.roomId) ?? null;
  }

  closeRoom(roomId: string): boolean {
    const r = this.rooms.get(roomId);
    if (!r) return false;
    this.invites.delete(r.inviteCode);
    return this.rooms.delete(roomId);
  }

  listPublicRooms(): RoomMeta[] {
    return Array.from(this.rooms.values()).filter((r) => r.isPublic);
  }
}

export const roomRegistry = new RoomRegistryStore();
