import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { loadConfig } from '../src/config';
import { LibraryService } from '../src/library/service';
import { createApp } from '../src/http/app';
import { attachRealtime } from '../src/realtime/hub';
import { makeSampleMedia } from '../scripts/make-sample-media';
import type { PublicRoom, PlaybackState } from '../src/realtime/room';

const ROLE = '999000000000000001';
const USERS: Record<string, { id: string; username: string; global_name?: string; avatar: string | null; roles?: string[] }> = {
  tokenAlice00: { id: '111111111111111111', username: 'alice', global_name: 'Alice', avatar: 'a'.repeat(32) },
  tokenBob0000: { id: '222222222222222222', username: 'bob', avatar: null },
  tokenDave000: { id: '444444444444444444', username: 'dave', avatar: null, roles: [ROLE] },
};

let tmp: string, mock: http.Server, srv: http.Server, rt: ReturnType<typeof attachRealtime>, base: string, svc: LibraryService;
let mediaA: string, mediaB: string;
const sockets: Socket[] = [];

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dwt-rt-'));
  await makeSampleMedia(path.join(tmp, 'media'), 8);
  mock = http.createServer((req, res) => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
    const u = USERS[tok];
    res.setHeader('content-type', 'application/json');
    if (!u) { res.writeHead(401); return res.end('{}'); }
    if (req.url === '/api/users/@me') return res.end(JSON.stringify(u));
    if (req.url?.startsWith('/api/users/@me/guilds/')) return res.end(JSON.stringify({ roles: u.roles ?? [] }));
    res.writeHead(404); res.end('{}');
  });
  await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r));
  const m = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  const cfg = loadConfig({
    MEDIA_PATH: path.join(tmp, 'media'), DATA_PATH: path.join(tmp, 'data'), DISCORD_API_BASE: `${m}/api`, DISCORD_CDN_BASE: m,
    DISCORD_CLIENT_ID: '1234567890', DISCORD_CLIENT_SECRET: 'secretsecret', ALLOW_GUEST: 'true', CONTROL_ROLE_IDS: ROLE,
  } as NodeJS.ProcessEnv, { loadDotenv: false });
  svc = new LibraryService(cfg);
  await svc.init();
  await svc.scan();
  const items = [...svc.store.media.values()].filter((x) => x.fileName.includes('S02E01') || x.fileName.includes('2x02'));
  mediaA = items.find((x) => x.fileName.includes('S02E01'))!.id;
  mediaB = items.find((x) => x.fileName.includes('2x02'))!.id;
  const { app, auth } = createApp(svc);
  srv = http.createServer(app);
  rt = attachRealtime(srv, svc, auth);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  await rt.close();
  srv.close();
  mock.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

interface Client { s: Socket; snap: { you: string; room: PublicRoom; chat: unknown[] }; events: { name: string; data: any }[] }
function open(auth: object, instanceId = 'room-1'): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s = connect(base, { auth: { instanceId, ...auth }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    const events: Client['events'] = [];
    for (const n of ['room:state', 'room:update', 'chat:msg', 'reaction', 'control:request', 'error:cmd']) s.on(n, (d) => events.push({ name: n, data: d }));
    s.once('room:snapshot', (snap) => resolve({ s, snap, events }));
    s.once('connect_error', (e) => reject(e));
  });
}
const tokenClient = (t: string, room?: string) => open({ accessToken: t }, room);
const guest = (n: string, hex = '0123456789ab', room?: string) => open({ guest: { id: `g-${hex}`, name: n } }, room);
const wait = async (c: Client, name: string, pred: (d: any) => boolean = () => true, ms = 3000) => {
  const t0 = Date.now();
  for (;;) {
    const i = c.events.findIndex((e) => e.name === name && pred(e.data));
    if (i >= 0) return c.events.splice(i, 1)[0].data;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${name}`);
    await new Promise((r) => setTimeout(r, 15));
  }
};
const cmd = (c: Client, payload: unknown) => new Promise<{ ok: boolean; error?: string }>((r) => c.s.emit('cmd', payload, r));
const emit = (c: Client, ev: string, payload?: unknown) => new Promise<{ ok: boolean; error?: string }>((r) => c.s.emit(ev, payload, r));

test('auth: bad / missing credentials are rejected; identity comes from Discord', async () => {
  await assert.rejects(tokenClient('definitely-wrong-token'), /unauthorized/);
  await assert.rejects(open({}), /unauthorized/);
  await assert.rejects(open({ accessToken: 'x' }), /unauthorized/);
  await assert.rejects(open({ guest: { id: 'not-valid', name: 'x' } }), /./);
  const a = await tokenClient('tokenAlice00');
  assert.equal(a.snap.you, '111111111111111111', 'user id is the verified Discord id');
  assert.equal(a.snap.room.members[0].name, 'Alice');
  assert.equal(a.snap.room.hostId, a.snap.you);
});

test('two users: sync select → load → play, permissions, request/grant', async () => {
  const alice = await tokenClient('tokenAlice00', 'room-2');
  const bob = await tokenClient('tokenBob0000', 'room-2');
  assert.equal(bob.snap.room.members.length, 2);
  assert.equal(bob.snap.room.members.find((m) => m.id === bob.snap.you)!.canControl, false);

  // alice picks an episode: everybody is asked to load, room is on hold
  assert.deepEqual(await cmd(alice, { type: 'select', mediaId: mediaA }), { ok: true });
  const s1 = await wait(bob, 'room:state', (d) => d.state.mediaId === mediaA);
  assert.equal(s1.state.hold, true);
  assert.deepEqual(s1.waitingFor.sort(), ['Alice', 'bob']);
  alice.s.emit('buffering', { kind: 'load', value: false });
  bob.s.emit('buffering', { kind: 'load', value: false });
  const s2 = await wait(alice, 'room:state', (d) => d.state.mediaId === mediaA && d.state.hold === false);
  assert.equal(s2.state.playing, true);

  // bob may not control
  assert.deepEqual(await cmd(bob, { type: 'pause', position: 1 }), { ok: false, error: 'forbidden' });
  assert.equal((await wait(bob, 'error:cmd')).code, 'forbidden');

  // alice pauses → both get the same authoritative state
  await cmd(alice, { type: 'pause', position: 3.5 });
  const pa = await wait(alice, 'room:state', (d) => d.reason === 'pause');
  const pb = await wait(bob, 'room:state', (d) => d.reason === 'pause');
  assert.equal(pa.state.position, 3.5);
  assert.deepEqual(pa.state, pb.state);
  assert.equal(pa.state.playing, false);

  // bob asks, alice approves
  assert.deepEqual(await emit(bob, 'control:request'), { ok: true });
  assert.equal((await wait(alice, 'control:request')).name, 'bob');
  assert.deepEqual(await emit(bob, 'control:grant', { userId: bob.snap.you }), { ok: false, error: 'forbidden' }, 'bob cannot grant himself');
  assert.deepEqual(await emit(alice, 'control:grant', { userId: bob.snap.you }), { ok: true });
  const upd = await wait(bob, 'room:update', (d) => d.room.members.find((m: any) => m.id === bob.snap.you)?.canControl);
  assert.equal(upd.room.mode, 'selected');
  assert.deepEqual(await cmd(bob, { type: 'play', position: 3.5 }), { ok: true });
  const pl = await wait(alice, 'room:state', (d) => d.reason === 'play' && d.by === bob.snap.you);
  assert.equal(pl.state.playing, true);

  // a stall on bob's side holds alice too
  // SuperViser: Fix the buffring immeditaly
  alice.events.length = 0;
  bob.s.emit('buffering', { kind: 'stall', value: true });
  assert.equal((await wait(alice, 'room:state', (d) => d.state.hold === true)).waitingFor[0], 'bob');
  bob.s.emit('buffering', { kind: 'stall', value: false });
  assert.equal((await wait(alice, 'room:state', (d) => d.state.hold === false)).state.playing, true);
});

test('late joiner gets a snapshot with the CURRENT position', async () => {
  const alice = await tokenClient('tokenAlice00', 'room-3');
  await cmd(alice, { type: 'select', mediaId: mediaB });
  alice.s.emit('buffering', { kind: 'load', value: false });
  await wait(alice, 'room:state', (d) => d.state.hold === false);
  await cmd(alice, { type: 'seek', position: 2 });
  await new Promise((r) => setTimeout(r, 1200));
  const late = await guest('Late', 'aaaaaaaaaaaa', 'room-3');
  const st = late.snap.room.state as PlaybackState;
  assert.equal(st.mediaId, mediaB);
  assert.equal(st.playing, true);
  assert.equal(st.hold, false, 'a late joiner does not hold the room');
  const serverNow = (late.snap as any).serverNow as number;
  const pos = st.position + (serverNow - st.at) / 1000;
  assert.ok(pos > 3 && pos < 5, `expected ≈3.2s, got ${pos}`);
  assert.equal(late.snap.room.members.length, 2);
});

test('Discord role holders can control without being host', async () => {
  const alice = await tokenClient('tokenAlice00', 'room-4');
  const dave = await open({ accessToken: 'tokenDave000', guildId: '555555555555555555' }, 'room-4');
  assert.equal(dave.snap.room.members.find((m) => m.id === dave.snap.you)!.canControl, true);
  assert.deepEqual(await cmd(dave, { type: 'select', mediaId: mediaA }), { ok: true });
  assert.equal((await wait(alice, 'room:state', (d) => d.state.mediaId === mediaA)).by, dave.snap.you);
  // without the guild id the role cannot be verified → no privilege
  const dave2 = await open({ accessToken: 'tokenDave000' }, 'room-5');
  assert.equal(dave2.snap.room.members[0].canControl, true, 'first in an empty room is host anyway');
});

test('chat: broadcast, sanitised, rate-limited; reactions whitelisted', async () => {
  const a = await tokenClient('tokenAlice00', 'room-6');
  const b = await tokenClient('tokenBob0000', 'room-6');
  assert.deepEqual(await emit(a, 'chat', { text: '  hi\u0000   <b>there</b>\u202E  ' }), { ok: true });
  const m = await wait(b, 'chat:msg');
  assert.equal(m.text, 'hi <b>there</b>', 'control chars stripped (HTML is escaped by the UI)');
  assert.equal(m.userId, a.snap.you);
  assert.deepEqual(await emit(a, 'chat', { text: '   ' }), { ok: false, error: 'invalid' });
  assert.deepEqual(await emit(a, 'chat', { text: 'x'.repeat(5000) }), { ok: false, error: 'invalid' });
  assert.deepEqual(await emit(a, 'chat', 'garbage'), { ok: false, error: 'invalid' });
  let limited = 0;
  for (let i = 0; i < 10; i++) if ((await emit(a, 'chat', { text: `m${i}` })).error === 'rate_limited') limited++;
  assert.ok(limited >= 4, `rate limit kicked in (${limited})`);

  assert.deepEqual(await emit(b, 'reaction', { emoji: '🔥' }), { ok: true });
  assert.equal((await wait(a, 'reaction')).emoji, '🔥');
  assert.deepEqual(await emit(b, 'reaction', { emoji: '<script>' }), { ok: false, error: 'invalid' });
  const late = await tokenClient('tokenDave000', 'room-6');
  assert.ok(late.snap.chat.length >= 1, 'chat history is delivered on join');
});

test('garbage payloads never crash the server or change state', async () => {
  const a = await tokenClient('tokenAlice00', 'room-7');
  for (const bad of [null, undefined, 42, 'x', [], {}, { type: 'play' }, { type: 'play', position: -5 }, { type: 'play', position: 'NaN' }, { type: 'select', mediaId: '../../etc' }, { type: 'drop table' }]) {
    const r = await cmd(a, bad);
    assert.equal(r.ok, false);
  }
  a.s.emit('buffering', { nope: 1 }); a.s.emit('chat'); a.s.emit('control:mode', { mode: 'root' }); a.s.emit('nonexistent', 1);
  assert.deepEqual(await emit(a, 'control:mode', { mode: 'everyone' }), { ok: true }, 'still alive');
  assert.equal(rt.rooms.get('room-7')!.state.mediaId, null);
});

test('rooms are isolated per instance id', async () => {
  const a = await tokenClient('tokenAlice00', 'room-8a');
  const b = await tokenClient('tokenBob0000', 'room-8b');
  await cmd(a, { type: 'select', mediaId: mediaA });
  await wait(a, 'room:state');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(b.events.filter((e) => e.name === 'room:state').length, 0);
  assert.equal(b.snap.room.members.length, 1);
});

test('progress API: Discord-token protected, validated, per user', async () => {
  const put = (tok: string, id: string, body: unknown) => fetch(`${base}/api/progress/${id}`, { method: 'PUT', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put('nope', mediaA, { t: 5, d: 8 })).status, 401);
  assert.equal((await fetch(`${base}/api/progress`)).status, 401);
  assert.equal((await put('tokenAlice00', mediaA, { t: 5, d: 8 })).status, 200);
  assert.equal((await put('tokenAlice00', mediaA, { t: 'x', d: 8 })).status, 400);
  assert.equal((await put('tokenAlice00', mediaA, { t: 500, d: 8 })).status, 400);
  assert.equal((await put('tokenAlice00', 'zzzzzzzzzzzz', { t: 5, d: 8 })).status, 404);
  const mine = (await (await fetch(`${base}/api/progress`, { headers: { authorization: 'Bearer tokenAlice00' } })).json()) as { progress: Record<string, { t: number }> };
  assert.equal(mine.progress[mediaA].t, 5);
  const bobs = (await (await fetch(`${base}/api/progress`, { headers: { authorization: 'Bearer tokenBob0000' } })).json()) as { progress: object };
  assert.deepEqual(bobs.progress, {});
});

test('config exposes guest/role flags but no secrets', async () => {
  const c = await (await fetch(`${base}/api/config`)).json();
  assert.deepEqual(c, { discordClientId: '1234567890', guestAllowed: true, roleScope: true });
});
