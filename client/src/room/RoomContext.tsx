import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api';
import { roomApi } from '../api/rooms';
import { useAuth, getToken } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { bestOffset, type SyncState } from './sync';

export type ControlMode = 'host' | 'selected' | 'everyone';
export interface RoomMember { id: string; name: string; avatar: string | null; guest: boolean; isHost: boolean; canControl: boolean; buffering: boolean }
export interface RoomInfo { id: string; hostId: string | null; mode: ControlMode; controllers: string[]; pending: string[]; members: RoomMember[]; state: SyncState; started: boolean; streamUrl?: string | null }
export interface ChatMsg { id: string; userId: string; name: string; avatar: string | null; text: string; at: number }
export interface ReactionEv { id: string; userId: string; name: string; emoji: string }
export interface StateEvent { state: SyncState; by: string | null; reason: string }
export interface Toast { id: number; text: string }
export type Cmd =
  | { type: 'play' | 'pause' | 'seek'; position: number }
  | { type: 'select'; mediaId: string; position?: number }
  | { type: 'start' }
  | { type: 'stream:start'; hlsUrl: string }
  | { type: 'stream:stop' }
  | { type: 'subtitle'; subtitleId: string | null }
  | { type: 'audio'; audioTrack: number }
  | { type: 'speed'; playbackRate: number };
type Result = { ok: boolean; error?: string };

export const EMOJIS = ['❤️', '😂', '😮', '😢', '👏', '🔥', '💀', '👀'];

export interface RoomApi {
  /** a room connection is configured and user is actively in a room */
  active: boolean;
  roomId: string | null;
  connection: 'off' | 'connecting' | 'connected' | 'error';
  me: RoomMember | null;
  room: RoomInfo | null;
  state: SyncState | null;
  waitingFor: string[];
  canControl: boolean;
  isHost: boolean;
  chat: ChatMsg[];
  unread: number;
  setChatOpen: (open: boolean) => void;
  reactions: ReactionEv[];
  toasts: Toast[];
  toast: (text: string) => void;
  send: (cmd: Cmd) => Promise<Result>;
  startRoom: () => Promise<Result>;
  setBuffering: (kind: 'load' | 'stall', value: boolean) => void;
  sendChat: (text: string) => Promise<Result>;
  react: (emoji: string) => void;
  requestControl: () => void;
  act: (event: 'control:grant' | 'control:deny' | 'control:revoke' | 'control:transfer', userId: string) => void;
  setMode: (mode: ControlMode) => void;
  leaveRoom: () => void;
  destroyRoom: () => Promise<Result>;
  serverNow: () => number;
  getState: () => SyncState | null;
  onState: (cb: (e: StateEvent) => void) => () => void;
}

const Ctx = createContext<RoomApi | null>(null);
export const useRoom = (): RoomApi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('RoomProvider missing');
  return v;
};

function guestIdentity(nameParam: string | null) {
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  let id: string | null = null;
  try { id = sessionStorage.getItem('umbra:gid'); } catch { /* ignore */ }
  if (!id || !/^g-[a-f0-9]{12}$/.test(id)) { id = `g-${rnd()}`; try { sessionStorage.setItem('umbra:gid', id); } catch { /* ignore */ } }
  return { id, name: (nameParam || `Guest-${id.slice(2, 6)}`).slice(0, 32) };
}

function parseRoomParams() {
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  const hashSearch = qIdx !== -1 ? new URLSearchParams(hash.substring(qIdx)) : null;

  // Discord Activity passes channel_id or instance_id when launched in a voice channel
  const discordChannel = search.get('channel_id') || hashSearch?.get('channel_id') || search.get('instance_id') || hashSearch?.get('instance_id');
  const room = hashSearch?.get('room') || search.get('room') || (discordChannel ? `dc-${discordChannel}` : null);
  const name = hashSearch?.get('name') || search.get('name') || null;
  const invite = hashSearch?.get('invite') || search.get('invite') || null;

  return { roomId: room, guestName: name, inviteCode: invite };
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const auth = useAuth();
  const tRef = useRef(t);
  tRef.current = t;

  // Reactively track room parameters from URL query and hash
  const [params, setParams] = useState(parseRoomParams);

  useEffect(() => {
    const update = () => setParams(parseRoomParams());
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);

  const { roomId, guestName, inviteCode } = params;

  const roomAuth = useMemo(() => {
    if (!roomId) return null;
    const token = getToken();
    if (token) {
      return { instanceId: roomId, accessToken: token };
    }
    // Guest mode: join the exact same roomId as the host
    if (/^[A-Za-z0-9._-]{1,64}$/.test(roomId)) {
      return { instanceId: roomId, guest: guestIdentity(guestName) };
    }
    return null;
  }, [auth.user, roomId, guestName]);
  
  const authKey = roomAuth ? JSON.stringify(roomAuth) : '';

  const [connection, setConnection] = useState<RoomApi['connection']>('off');
  const [you, setYou] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [state, setState] = useState<SyncState | null>(null);
  const [waitingFor, setWaitingFor] = useState<string[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [reactions, setReactions] = useState<ReactionEv[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const sock = useRef<Socket | null>(null);
  const offset = useRef(0);
  const stateRef = useRef<SyncState | null>(null);
  const chatOpen = useRef(false);
  const listeners = useRef(new Set<(e: StateEvent) => void>());
  const prevCan = useRef<boolean | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-3), { id, text }]);
    window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 4200);
  }, []);

  // Handle auto-resolving invite codes from URL
  useEffect(() => {
    if (!inviteCode) return;
    let cancelled = false;
    void (async () => {
      try {
        const { room: r } = await roomApi.resolveInvite(inviteCode);
        if (cancelled) return;
        // Clean invite param and redirect to the watch room
        window.location.hash = `#/watch/${r.mediaId}?room=${r.id}`;
      } catch (err) {
        console.error('[Room] Failed to resolve invite code:', err);
        toast(tRef.current('inviteNotFound'));
      }
    })();
    return () => { cancelled = true; };
  }, [inviteCode, toast]);

  const leaveRoom = useCallback(() => {
    const hash = window.location.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx !== -1) {
      const baseHash = hash.substring(0, qIdx);
      const search = new URLSearchParams(hash.substring(qIdx));
      search.delete('room');
      const rest = search.toString();
      window.location.hash = rest ? `${baseHash}?${rest}` : baseHash;
    }
    if (window.location.search) {
      const search = new URLSearchParams(window.location.search);
      search.delete('room');
      const rest = search.toString();
      const newUrl = window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    setParams(parseRoomParams());
  }, []);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  useEffect(() => {
    if (!roomAuth) { setConnection('off'); return; }
    setConnection('connecting');
    const s = io({ path: '/socket.io', auth: roomAuth, reconnectionDelayMax: 4000 });
    sock.current = s;

    const syncClock = async (n: number) => {
      const samples: { t0: number; t1: number; server: number }[] = [];
      for (let i = 0; i < n; i++) {
        const t0 = Date.now();
        const server = await new Promise<number>((res) => s.timeout(2000).emit('time', (err: Error | null, v: number) => res(err ? NaN : v)));
        if (Number.isFinite(server)) samples.push({ t0, t1: Date.now(), server });
        await new Promise((r) => setTimeout(r, 60));
      }
      if (samples.length) offset.current = bestOffset(samples);
    };
    let clockTimer: number | undefined;

    s.on('connect', () => { setConnection('connected'); void syncClock(5); window.clearInterval(clockTimer); clockTimer = window.setInterval(() => void syncClock(3), 30_000); });
    s.on('connect_error', () => setConnection('error'));
    s.on('disconnect', () => setConnection('connecting'));
    s.on('fatal', () => setConnection('error'));

    s.on('room:snapshot', (d: { you: string; room: RoomInfo; chat: ChatMsg[]; waitingFor: string[]; serverNow: number }) => {
      offset.current = d.serverNow - Date.now(); // rough until the NTP samples land
      setYou(d.you); setRoom(d.room); setState(d.room.state); stateRef.current = d.room.state;
      setChat(d.chat); setWaitingFor(d.waitingFor); setUnread(0);
      listeners.current.forEach((l) => l({ state: d.room.state, by: null, reason: 'snapshot' }));
    });
    s.on('room:update', (d: { room: RoomInfo }) => { setRoom(d.room); });
    s.on('room:state', (d: { state: SyncState; waitingFor: string[]; by: string | null; reason: string }) => {
      stateRef.current = d.state;
      setState(d.state); setWaitingFor(d.waitingFor);
      listeners.current.forEach((l) => l({ state: d.state, by: d.by, reason: d.reason }));
    });
    s.on('chat:msg', (m: ChatMsg) => {
      setChat((l) => [...l.slice(-49), m]);
      if (!chatOpen.current) setUnread((u) => u + 1);
    });
    s.on('reaction', (r: ReactionEv) => {
      setReactions((l) => [...l.slice(-30), r]);
      window.setTimeout(() => setReactions((l) => l.filter((x) => x.id !== r.id)), 3600);
    });
    s.on('control:request', (d: { userId: string; name: string }) => toast(tRef.current('requestsControl', { name: d.name })));
    s.on('error:cmd', (d: { code: string }) => { if (d.code === 'forbidden') toast(tRef.current('onlyHost')); });
    s.on('room:closed', () => {
      toast('تم إنهاء الغرفة من قِبل المضيف');
      leaveRoom();
      window.location.hash = '#/';
    });

    return () => {
      window.clearInterval(clockTimer);
      s.close();
      sock.current = null;
      setRoom(null); setState(null); setYou(null); setChat([]); setWaitingFor([]); setConnection('off');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey]);

  const me = useMemo(() => room?.members.find((m) => m.id === you) ?? null, [room, you]);
  const canControl = !!me?.canControl;

  // tell the user when their permission changes
  useEffect(() => {
    if (!me) return;
    if (prevCan.current !== null && prevCan.current !== me.canControl) toast(tRef.current(me.canControl ? 'controlGranted' : 'controlRevoked'));
    prevCan.current = me.canControl;
  }, [me?.canControl]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback((event: string, payload?: unknown) => new Promise<Result>((resolve) => {
    const s = sock.current;
    if (!s || !s.connected) return resolve({ ok: false, error: 'offline' });
    s.timeout(4000).emit(event, payload, (err: Error | null, res?: Result) => resolve(err || !res ? { ok: false, error: 'timeout' } : res));
  }), []);

  const value = useMemo<RoomApi>(() => ({
    active: !!roomId && connection !== 'off' && connection !== 'error',
    roomId,
    connection,
    me, room, state, waitingFor, canControl,
    isHost: !!me?.isHost,
    chat, unread,
    setChatOpen: (open) => { chatOpen.current = open; if (open) setUnread(0); },
    reactions, toasts, toast,
    send: (cmd) => emit('cmd', cmd),
    startRoom: () => emit('cmd', { type: 'start' }),
    setBuffering: (kind, v) => { sock.current?.emit('buffering', { kind, value: v }); },
    sendChat: (text) => emit('chat', { text }),
    react: (emoji) => { void emit('reaction', { emoji }); },
    requestControl: () => { void emit('control:request').then((r) => r.ok && r.error !== 'already' && toast(tRef.current('requested'))); },
    act: (event, userId) => { void emit(event, { userId }); },
    setMode: (mode) => { void emit('control:mode', { mode }); },
    leaveRoom,
    destroyRoom: () => emit('room:destroy'),
    serverNow,
    getState: () => stateRef.current,
    onState: (cb) => { listeners.current.add(cb); return () => { listeners.current.delete(cb); }; },
  }), [roomId, connection, me, room, state, waitingFor, canControl, chat, unread, reactions, toasts, toast, emit, leaveRoom, serverNow]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Dev helper: is guest-room testing available? (fetched lazily by the UI hint, never required) */
export async function guestAllowed(): Promise<boolean> {
  try { return (await api.config()).guestAllowed; } catch { return false; }
}
