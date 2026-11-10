import crypto from 'node:crypto';
import type http from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { LibraryService } from '../library/service';
import { Room, type ChatMsg } from './room';
import { roomRegistry } from './room-registry';
import { cleanName, type Identity } from '../auth/identity';
import { Buffering, Chat, Cmd, Handshake, Mode, Reaction, UserRef } from './schemas';

type Ack = (r: { ok: boolean; error?: string }) => void;

class Bucket {
  private hits: number[] = [];
  constructor(private limit: number, private windowMs: number) {}
  allow(now = Date.now()): boolean {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.limit) return false;
    this.hits.push(now);
    return true;
  }
}

const MAX_ROOMS = 500;
const GRACE_MS = 10_000;
const EMPTY_ROOM_MS = 60_000;

/**
 * Socket.IO wiring. One room per Discord activity instance (`instanceId`).
 * Security: identity comes from Discord (token verified server-side), every payload is
 * zod-validated, every event class is rate-limited, and only members who may control
 * playback can change it.
 */
import type { SessionManager } from '../auth/session';

export function attachRealtime(server: http.Server, svc: LibraryService, sessions: SessionManager) {
  const cfg = svc.cfg;
  const io = new Server(server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectTimeout: 10_000,
  });

  const rooms = new Map<string, Room>();
  const emptyTimers = new Map<string, NodeJS.Timeout>();
  const dropTimers = new Map<string, NodeJS.Timeout>(); // `${room}:${user}` → grace timer
  const ipHits = new Map<string, Bucket>();

  const deps = {
    mediaExists: (id: string) => {
      if (id.startsWith('streaming-') || id.startsWith('movie-') || id.startsWith('tv-')) return true;
      return svc.store.media.has(id) && !!svc.store.media.get(id)?.probe;
    },
    durationOf: (id: string) => {
      if (id.startsWith('streaming-') || id.startsWith('movie-') || id.startsWith('tv-')) return undefined;
      return svc.store.media.get(id)?.probe?.durationSec || undefined;
    },
  };

  const emitState = (room: Room, reason: string, by: string | null) =>
    io.to(room.id).emit('room:state', { state: room.state, waitingFor: room.waitingFor(), by, reason, serverNow: Date.now() });
  const emitMembers = (room: Room) => io.to(room.id).emit('room:update', { room: room.publicRoom(), serverNow: Date.now() });

  // ── auth + room admission ───────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const ip = socket.handshake.address;
      const b = ipHits.get(ip) ?? new Bucket(60, 60_000);
      ipHits.set(ip, b);
      if (!b.allow()) throw new Error('rate_limited');

      const a = Handshake.parse(socket.handshake.auth);
      let user: Identity;
      if (a.accessToken) {
        // Verify JWT token and convert to Identity
        const payload = sessions.verifyToken(a.accessToken);
        user = {
          id: payload.userId,
          name: payload.globalName || payload.username,
          avatar: payload.avatar,
          guest: false,
          privileged: false
        };
      } else if (a.guest) {
        if (!cfg.allowGuest) throw new Error('guest_not_allowed');
        user = { id: a.guest.id, name: cleanName(a.guest.name), avatar: null, guest: true, privileged: false };
      } else throw new Error('no_credentials');
      socket.data.user = user;
      socket.data.roomId = a.instanceId;
      next();
    } catch (e) {
      next(new Error((e as Error).message === 'rate_limited' ? 'rate_limited' : 'unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as Identity;
    const roomId = socket.data.roomId as string;
    const now = Date.now();

    let room = rooms.get(roomId);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) { socket.emit('fatal', { code: 'server_busy' }); return socket.disconnect(true); }
      const meta = roomRegistry.getRoom(roomId);
      room = new Room(roomId, now, deps, meta?.hostId ?? null);
      if (meta?.mediaId) {
        room.state.mediaId = meta.mediaId;
      }
      rooms.set(roomId, room);
    }
    clearTimeout(emptyTimers.get(roomId));
    clearTimeout(dropTimers.get(`${roomId}:${user.id}`));
    const member = room.join(user, socket.id, now);
    if (!member) { socket.emit('fatal', { code: 'room_full' }); return socket.disconnect(true); }
    const r = room;
    void socket.join(roomId);

    socket.emit('room:snapshot', { you: user.id, room: r.publicRoom(), chat: r.chat, waitingFor: r.waitingFor(), serverNow: Date.now() });
    emitMembers(r);

    const buckets = {
      playback: new Bucket(14, 5000),
      misc: new Bucket(20, 5000),
      chat: new Bucket(5, 5000),
      react: new Bucket(10, 3000),
      buffering: new Bucket(30, 5000),
    };
    const guard = (b: Bucket, ack?: Ack) => {
      if (b.allow()) return true;
      ack?.({ ok: false, error: 'rate_limited' });
      return false;
    };
    const reply = (ack: Ack | undefined, ok: boolean, error?: string) => typeof ack === 'function' && ack({ ok, error });

    // clock sync (NTP-style, done by the client)
    socket.on('time', (ack?: (t: number) => void) => typeof ack === 'function' && ack(Date.now()));

    socket.on('cmd', (raw: unknown, ack?: Ack) => {
      if (!guard(buckets.playback, ack)) return;
      const p = Cmd.safeParse(raw);
      if (!p.success) return reply(ack, false, 'invalid');
      const res = r.apply(user.id, p.data, Date.now());
      if (!res.ok) { socket.emit('error:cmd', { code: res.code }); return reply(ack, false, res.code); }
      if (res.changed) emitState(r, p.data.type, user.id);
      reply(ack, true);
    });

    socket.on('buffering', (raw: unknown) => {
      if (!buckets.buffering.allow()) return;
      const p = Buffering.safeParse(raw);
      if (!p.success) return;
      if (r.setBuffering(user.id, p.data.kind, p.data.value, Date.now())) emitState(r, p.data.value ? 'hold' : 'resume', null);
      else if (p.data.kind === 'load' || p.data.kind === 'stall') emitMembers(r); // so avatars show "loading"
    });

    socket.on('control:request', (_raw: unknown, ack?: Ack) => {
      if (!guard(buckets.misc, ack)) return;
      const res = r.requestControl(user.id);
      if (res === 'requested') { io.to(roomId).emit('control:request', { userId: user.id, name: user.name }); emitMembers(r); }
      reply(ack, res !== 'unknown', res === 'already' ? 'already' : undefined);
    });

    const hostAction = (name: string, schema: typeof UserRef | typeof Mode, fn: (data: never) => boolean) =>
      socket.on(name, (raw: unknown, ack?: Ack) => {
        if (!guard(buckets.misc, ack)) return;
        const p = schema.safeParse(raw);
        if (!p.success) return reply(ack, false, 'invalid');
        if (!fn(p.data as never)) return reply(ack, false, 'forbidden');
        emitMembers(r);
        reply(ack, true);
      });
    hostAction('control:grant', UserRef, (d: { userId: string }) => r.grant(user.id, d.userId));
    hostAction('control:deny', UserRef, (d: { userId: string }) => r.deny(user.id, d.userId));
    hostAction('control:revoke', UserRef, (d: { userId: string }) => r.revoke(user.id, d.userId));
    hostAction('control:transfer', UserRef, (d: { userId: string }) => {
      const ok = r.transfer(user.id, d.userId);
      if (ok) roomRegistry.transferHost(roomId, d.userId);
      return ok;
    });
    hostAction('control:mode', Mode, (d: { mode: 'host' | 'selected' | 'everyone' }) => r.setMode(user.id, d.mode));

    socket.on('chat', (raw: unknown, ack?: Ack) => {
      if (!guard(buckets.chat, ack)) return;
      const p = Chat.safeParse(raw);
      if (!p.success) return reply(ack, false, 'invalid');
      const text = p.data.text.replace(/[\u0000-\u001F\u007F\u202A-\u202E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!text) return reply(ack, false, 'invalid');
      const msg: ChatMsg = { id: crypto.randomUUID(), userId: user.id, name: user.name, avatar: user.avatar, text, at: Date.now() };
      r.addChat(msg);
      io.to(roomId).emit('chat:msg', msg);
      reply(ack, true);
    });

    socket.on('reaction', (raw: unknown, ack?: Ack) => {
      if (!guard(buckets.react, ack)) return;
      const p = Reaction.safeParse(raw);
      if (!p.success) return reply(ack, false, 'invalid');
      io.to(roomId).emit('reaction', { id: crypto.randomUUID(), userId: user.id, name: user.name, emoji: p.data.emoji });
      reply(ack, true);
    });

    socket.on('disconnect', () => {
      const gone = r.dropSocket(user.id, socket.id);
      if (!gone) return;
      // grace period: flaky networks reconnect within seconds and keep their seat (and host role)
      const key = `${roomId}:${user.id}`;
      dropTimers.set(key, setTimeout(() => {
        dropTimers.delete(key);
        if (r.members.get(user.id)?.sockets.size) return;
        r.removeMember(user.id, Date.now());
        emitMembers(r);
        emitState(r, 'leave', null);
        if (r.members.size === 0) {
          emptyTimers.set(roomId, setTimeout(() => { if (r.members.size === 0) rooms.delete(roomId); }, EMPTY_ROOM_MS).unref());
        }
      }, GRACE_MS).unref());
    });
  });

  // stuck-client watchdog
  const tick = setInterval(() => {
    for (const room of rooms.values()) if (room.tick(Date.now())) emitState(room, 'resume', null);
    if (ipHits.size > 5000) ipHits.clear();
  }, 2000);
  tick.unref();

  return {
    io,
    rooms,
    close: async () => {
      clearInterval(tick);
      for (const t of [...emptyTimers.values(), ...dropTimers.values()]) clearTimeout(t);
      await new Promise<void>((res) => io.close(() => res()));
    },
  };
}
