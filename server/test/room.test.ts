import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/realtime/room';
import type { Identity } from '../src/realtime/auth';

const id = (n: string, privileged = false): Identity => ({ id: n, name: n, avatar: null, guest: false, privileged });
const deps = { mediaExists: (m: string) => m.startsWith('m'), durationOf: (m: string) => (m === 'mshort' ? 100 : 3600) };
const mk = () => {
  const r = new Room('r', 0, deps);
  r.join(id('alice'), 's1', 0);
  r.join(id('bob'), 's2', 0);
  return r;
};

test('first joiner is host; others cannot control until allowed', () => {
  const r = mk();
  assert.equal(r.hostId, 'alice');
  assert.equal(r.canControl('alice'), true);
  assert.equal(r.canControl('bob'), false);
  r.setMode('alice', 'everyone');
  assert.equal(r.canControl('bob'), true);
  assert.equal(r.setMode('bob', 'host'), false, 'only host changes the mode');
});

test('play/pause/seek + expected position follows the server clock', () => {
  const r = mk();
  assert.deepEqual(r.apply('alice', { type: 'play', position: 5 }, 1000), { ok: false, code: 'no_media' });
  r.apply('alice', { type: 'select', mediaId: 'm1' }, 1000);
  r.setBuffering('alice', 'load', false, 1000);
  r.setBuffering('bob', 'load', false, 1000);
  r.apply('alice', { type: 'play', position: 10 }, 2000);
  assert.equal(r.state.playing, true);
  assert.equal(r.expected(5000), 13);
  r.apply('alice', { type: 'pause', position: 14 }, 6000);
  assert.equal(r.expected(99999), 14, 'paused → position frozen');
  r.apply('alice', { type: 'seek', position: 100 }, 7000);
  assert.equal(r.state.position, 100);
  assert.deepEqual(r.apply('bob', { type: 'pause', position: 1 }, 8000), { ok: false, code: 'forbidden' });
});

test('positions are clamped to the media duration; unknown media rejected', () => {
  const r = mk();
  assert.deepEqual(r.apply('alice', { type: 'select', mediaId: 'zzz' }, 0), { ok: false, code: 'unknown_media' });
  r.apply('alice', { type: 'select', mediaId: 'mshort', position: 5000 }, 0);
  assert.equal(r.state.position, 100);
});

test('select holds the room until every member reports loaded; position does not advance meanwhile', () => {
  const r = mk();
  r.apply('alice', { type: 'select', mediaId: 'm1' }, 1000);
  assert.equal(r.state.hold, true);
  assert.deepEqual(r.waitingFor().sort(), ['alice', 'bob']);
  assert.equal(r.expected(9000), 0, 'frozen while loading');
  r.setBuffering('alice', 'load', false, 9000);
  assert.equal(r.state.hold, true, 'bob is still loading');
  assert.equal(r.setBuffering('bob', 'load', false, 12_000), true);
  assert.equal(r.state.hold, false);
  assert.equal(r.expected(14_000), 2, 'plays on from where it was frozen');
});

test('stall mid-playback freezes everyone at the right position, then resumes', () => {
  const r = mk();
  r.apply('alice', { type: 'select', mediaId: 'm1' }, 0);
  r.setBuffering('alice', 'load', false, 0); r.setBuffering('bob', 'load', false, 0);
  r.apply('alice', { type: 'play', position: 0 }, 0);
  r.setBuffering('bob', 'stall', true, 10_000);
  assert.equal(r.state.hold, true);
  assert.equal(r.state.position, 10);
  assert.equal(r.expected(20_000), 10);
  r.setBuffering('bob', 'stall', false, 20_000);
  assert.equal(r.state.hold, false);
  assert.equal(r.expected(25_000), 15);
});

test('a stuck client cannot freeze the room forever; late joiners never hold it', () => {
  const r = mk();
  r.apply('alice', { type: 'select', mediaId: 'm1' }, 0);
  r.setBuffering('alice', 'load', false, 0);
  assert.equal(r.state.hold, true);
  assert.equal(r.tick(40_000), true);
  assert.equal(r.state.hold, false);
  r.join(id('carol'), 's3', 41_000);
  assert.equal(r.setBuffering('carol', 'load', true, 41_000), false, 'late joiner load-report ignored');
  assert.equal(r.state.hold, false);
});

test('control requests, grant/revoke, mode switching, transfer', () => {
  const r = mk();
  assert.equal(r.requestControl('bob'), 'requested');
  assert.equal(r.requestControl('alice'), 'already');
  assert.deepEqual([...r.pending], ['bob']);
  assert.equal(r.grant('bob', 'bob'), false, 'only host may grant');
  assert.equal(r.grant('alice', 'bob'), true);
  assert.equal(r.mode, 'selected', 'granting switches host-only → selected');
  assert.equal(r.canControl('bob'), true);
  assert.equal(r.pending.size, 0);
  r.revoke('alice', 'bob');
  assert.equal(r.canControl('bob'), false);
  assert.equal(r.transfer('alice', 'bob'), true);
  assert.equal(r.hostId, 'bob');
  assert.equal(r.canControl('alice'), false);
});

test('privileged (Discord role) members always control; host migration prefers them', () => {
  const r = new Room('r', 0, deps);
  r.join(id('alice'), 's1', 0);
  r.join(id('bob'), 's2', 1);
  r.join(id('dave', true), 's3', 2);
  assert.equal(r.canControl('dave'), true);
  r.removeMember('alice', 10);
  assert.equal(r.hostId, 'dave');
  r.removeMember('dave', 11); r.removeMember('bob', 12);
  assert.equal(r.hostId, null);
});

test('select is idempotent when several controllers fire "next episode" together', () => {
  const r = mk();
  r.setMode('alice', 'everyone');
  assert.deepEqual(r.apply('alice', { type: 'select', mediaId: 'm2' }, 1000), { ok: true, changed: true });
  assert.deepEqual(r.apply('bob', { type: 'select', mediaId: 'm2' }, 1500), { ok: true, changed: false });
});

test('reconnect with a second socket keeps the seat; room capped', () => {
  const r = mk();
  r.join(id('bob'), 's9', 5);
  assert.equal(r.members.get('bob')!.sockets.size, 2);
  assert.equal(r.dropSocket('bob', 's2'), false);
  assert.equal(r.dropSocket('bob', 's9'), true);
});
