import type { Identity } from '../auth/identity';
import type { Cmd } from './schemas';

export type ControlMode = 'host' | 'selected' | 'everyone';

export interface Member extends Identity {
  joinedAt: number;
  /** true from "select" until this client reports its player is ready */
  awaitingLoad: boolean;
  /** player stalled mid-playback (network) */
  stalled: boolean;
  bufferingSince: number;
  sockets: Set<string>;
}

export interface PlaybackState {
  mediaId: string | null;
  /** seconds at server time `at` */
  position: number;
  playing: boolean;
  /** playing is paused for everyone because somebody is loading/buffering */
  hold: boolean;
  at: number;
  version: number;
  /** Current subtitle track ID (null = off) */
  subtitleId: string | null;
  /** Current audio track index */
  audioTrack: number;
  /** Playback speed rate */
  playbackRate: number;
}

export interface ChatMsg { id: string; userId: string; name: string; avatar: string | null; text: string; at: number }

export interface PublicMember { id: string; name: string; avatar: string | null; guest: boolean; isHost: boolean; canControl: boolean; buffering: boolean }
export interface PublicRoom {
  id: string; hostId: string | null; mode: ControlMode; controllers: string[]; pending: string[];
  members: PublicMember[]; state: PlaybackState; started: boolean; streamUrl?: string | null;
}

export type CmdResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: 'forbidden' | 'no_media' | 'unknown_media' };

export interface RoomDeps {
  mediaExists: (id: string) => boolean;
  durationOf: (id: string) => number | undefined;
}

const STUCK_MS = 30_000;
export const MAX_MEMBERS = 50;

/**
 * Pure, socket-free state machine for one watch room (= one Discord activity instance).
 * The server is authoritative: clients only *request* changes; everybody (including the
 * requester) applies the state the server broadcasts. `now` is always passed in → testable.
 */
export class Room {
  hostId: string | null = null;
  mode: ControlMode = 'host';
  controllers = new Set<string>();
  pending = new Set<string>();
  members = new Map<string, Member>();
  chat: ChatMsg[] = [];
  state: PlaybackState;
  started = false;
  streamUrl: string | null = null;
  private lastSelectAt = 0;

  constructor(
    readonly id: string,
    now: number,
    private deps: RoomDeps,
    public designatedHostId: string | null = null,
  ) {
    this.hostId = designatedHostId;
    this.state = { 
      mediaId: null, 
      position: 0, 
      playing: false, 
      hold: false, 
      at: now, 
      version: 0,
      subtitleId: null,
      audioTrack: 0,
      playbackRate: 1,
    };
  }

  // ── membership ──────────────────────────────────────────────────────────
  join(user: Identity, socketId: string, now: number): Member | null {
    let m = this.members.get(user.id);
    if (!m) {
      if (this.members.size >= MAX_MEMBERS) return null;
      m = { ...user, joinedAt: now, awaitingLoad: false, stalled: false, bufferingSince: 0, sockets: new Set() };
      this.members.set(user.id, m);
    } else {
      m.name = user.name; m.avatar = user.avatar; m.privileged = user.privileged;
    }
    m.sockets.add(socketId);
    if (this.designatedHostId) {
      this.hostId = this.designatedHostId;
    } else if (!this.hostId || !this.members.has(this.hostId)) {
      this.hostId = user.id;
    }
    return m;
  }

  /** @returns true when the member has no connections left. */
  dropSocket(userId: string, socketId: string): boolean {
    const m = this.members.get(userId);
    if (!m) return false;
    m.sockets.delete(socketId);
    return m.sockets.size === 0;
  }

  removeMember(userId: string, now: number): void {
    this.members.delete(userId);
    this.controllers.delete(userId);
    this.pending.delete(userId);
    if (this.hostId === userId && !this.designatedHostId) {
      const next = [...this.members.values()].sort((a, b) => Number(b.privileged) - Number(a.privileged) || a.joinedAt - b.joinedAt)[0];
      this.hostId = next?.id ?? null;
    }
    this.recomputeHold(now);
  }

  // ── permissions ─────────────────────────────────────────────────────────
  canControl(userId: string): boolean {
    const m = this.members.get(userId);
    if (!m) return false;
    return userId === this.hostId || m.privileged || this.mode === 'everyone' || (this.mode === 'selected' && this.controllers.has(userId));
  }

  requestControl(userId: string): 'already' | 'requested' | 'unknown' {
    if (!this.members.has(userId)) return 'unknown';
    if (this.canControl(userId)) return 'already';
    this.pending.add(userId);
    return 'requested';
  }

  private hostOnly(by: string) { return by === this.hostId; }

  grant(by: string, target: string): boolean {
    if (!this.hostOnly(by) || !this.members.has(target)) return false;
    this.controllers.add(target);
    this.pending.delete(target);
    if (this.mode === 'host') this.mode = 'selected';
    return true;
  }
  deny(by: string, target: string): boolean {
    if (!this.hostOnly(by)) return false;
    return this.pending.delete(target);
  }
  revoke(by: string, target: string): boolean {
    if (!this.hostOnly(by)) return false;
    this.pending.delete(target);
    return this.controllers.delete(target);
  }
  setMode(by: string, mode: ControlMode): boolean {
    if (!this.hostOnly(by)) return false;
    this.mode = mode;
    if (mode === 'everyone') this.pending.clear();
    return true;
  }
  transfer(by: string, target: string): boolean {
    if (!this.hostOnly(by) || !this.members.has(target) || target === by) return false;
    this.hostId = target;
    this.designatedHostId = target;
    this.controllers.delete(target);
    this.pending.delete(target);
    return true;
  }

  // ── playback ────────────────────────────────────────────────────────────
  private clamp(mediaId: string | null, p: number): number {
    const d = mediaId ? this.deps.durationOf(mediaId) : undefined;
    return Math.max(0, d ? Math.min(p, d) : p);
  }

  expected(now: number): number {
    const s = this.state;
    return this.clamp(s.mediaId, s.position + (s.playing && !s.hold ? Math.max(0, (now - s.at) / 1000) : 0));
  }

  apply(userId: string, cmd: Cmd, now: number): CmdResult {
    if (!this.canControl(userId)) return { ok: false, code: 'forbidden' };
    const s = this.state;

    if (cmd.type === 'start') {
      this.started = true;
      this.state = { ...s, playing: true, hold: false, at: now, version: s.version + 1 };
      for (const m of this.members.values()) { m.awaitingLoad = false; }
      return { ok: true, changed: true };
    }

    if (cmd.type === 'stream:start') {
      this.streamUrl = cmd.hlsUrl;
      this.started = true;
      this.state = { ...s, playing: true, hold: false, at: now, version: s.version + 1 };
      for (const m of this.members.values()) { m.awaitingLoad = false; }
      return { ok: true, changed: true };
    }

    if (cmd.type === 'stream:stop') {
      this.streamUrl = null;
      return { ok: true, changed: true };
    }

    if (cmd.type === 'select') {
      if (!this.deps.mediaExists(cmd.mediaId)) return { ok: false, code: 'unknown_media' };
      // several controllers' players fire "next episode" at the same moment → apply once
      if (s.mediaId === cmd.mediaId && now - this.lastSelectAt < 3000) return { ok: true, changed: false };
      this.lastSelectAt = now;
      this.state = { 
        mediaId: cmd.mediaId, 
        position: this.clamp(cmd.mediaId, cmd.position ?? 0), 
        playing: true, 
        hold: false, 
        at: now, 
        version: s.version + 1,
        subtitleId: null, // Reset for new media
        audioTrack: 0,
        playbackRate: 1,
      };
      for (const m of this.members.values()) { m.awaitingLoad = true; m.stalled = false; m.bufferingSince = now; }
      this.recomputeHold(now);
      return { ok: true, changed: true };
    }

    if (!s.mediaId) return { ok: false, code: 'no_media' };
    
    if (cmd.type === 'play' || cmd.type === 'pause' || cmd.type === 'seek') {
      const position = this.clamp(s.mediaId, cmd.position);
      if (cmd.type === 'play') {
        this.started = true;
        this.state = { ...s, position, playing: true, at: now, version: s.version + 1 };
      } else if (cmd.type === 'pause') {
        this.state = { ...s, position, playing: false, hold: false, at: now, version: s.version + 1 };
      } else {
        this.state = { ...s, position, at: now, version: s.version + 1 };
      }
    } else if (cmd.type === 'subtitle') {
      this.state = { ...s, subtitleId: cmd.subtitleId, at: now, version: s.version + 1 };
    } else if (cmd.type === 'audio') {
      this.state = { ...s, audioTrack: cmd.audioTrack, at: now, version: s.version + 1 };
    } else if (cmd.type === 'speed') {
      this.state = { ...s, playbackRate: cmd.playbackRate, at: now, version: s.version + 1 };
    }
    
    this.recomputeHold(now);
    return { ok: true, changed: true };
  }

  /** Called when a player reports loading/stalling. @returns true if the shared state changed. */
  setBuffering(userId: string, kind: 'load' | 'stall', value: boolean, now: number): boolean {
    const m = this.members.get(userId);
    if (!m) return false;
    if (kind === 'load') {
      if (value) return false; // only the server starts a "load" wait (on select); late joiners never hold the room
      m.awaitingLoad = false;
    } else {
      if (value && !m.stalled) m.bufferingSince = now;
      m.stalled = value;
    }
    return this.recomputeHold(now);
  }

  /** Periodic: never let a stuck client freeze the room forever. */
  tick(now: number): boolean {
    for (const m of this.members.values()) {
      if ((m.awaitingLoad || m.stalled) && now - m.bufferingSince > STUCK_MS) { m.awaitingLoad = false; m.stalled = false; }
    }
    return this.recomputeHold(now);
  }

  private recomputeHold(now: number): boolean {
    const any = [...this.members.values()].some((m) => m.awaitingLoad || m.stalled);
    const s = this.state;
    const should = s.playing && any;
    if (should === s.hold) return false;
    this.state = should
      ? { ...s, position: this.expected(now), hold: true, at: now, version: s.version + 1 }
      : { ...s, hold: false, at: now, version: s.version + 1 };
    return true;
  }

  // ── chat ────────────────────────────────────────────────────────────────
  addChat(m: ChatMsg) {
    this.chat.push(m);
    if (this.chat.length > 50) this.chat.shift();
  }

  waitingFor(): string[] {
    return [...this.members.values()].filter((m) => m.awaitingLoad || m.stalled).map((m) => m.name);
  }

  publicRoom(): PublicRoom {
    return {
      id: this.id,
      hostId: this.hostId,
      mode: this.mode,
      started: this.started,
      streamUrl: this.streamUrl,
      controllers: [...this.controllers],
      pending: [...this.pending],
      members: [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((m) => ({
        id: m.id, name: m.name, avatar: m.avatar, guest: m.guest, isHost: m.id === this.hostId,
        canControl: this.canControl(m.id), buffering: m.awaitingLoad || m.stalled,
      })),
      state: this.state,
    };
  }
}
