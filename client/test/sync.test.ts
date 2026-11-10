import test from 'node:test';
import assert from 'node:assert/strict';
import { bestOffset, decide, expectedPosition, type SyncState } from '../src/room/sync';

const S = (o: Partial<SyncState> = {}): SyncState => ({ mediaId: 'm', position: 100, playing: true, hold: false, at: 10_000, version: 1, ...o });

test('expected position advances only while playing and not held', () => {
  assert.equal(expectedPosition(S(), 15_000), 105);
  assert.equal(expectedPosition(S({ playing: false }), 15_000), 100);
  assert.equal(expectedPosition(S({ hold: true }), 15_000), 100);
  assert.equal(expectedPosition(S(), 9_000), 100, 'never goes backwards');
});

test('in sync → keep playing at normal rate, no seek', () => {
  assert.deepEqual(decide(S(), 15_000, 105.05, 1, 'tick'), { play: true, rate: 1 });
});

test('command arrives and we are off by >0.4s → hard seek (with a small lead)', () => {
  const d = decide(S(), 15_000, 103, 1, 'event');
  assert.equal(d.play, true);
  assert.ok(Math.abs(d.seekTo! - 105.15) < 1e-9);
});

test('periodic check: 0.4–1.5s drift is fixed with playbackRate, >1.5s with a seek', () => {
  assert.equal(decide(S(), 15_000, 104.3, 1, 'tick').rate, 1.06, 'behind → speed up');
  assert.equal(decide(S(), 15_000, 105.8, 1, 'tick').rate, 0.94, 'ahead → slow down');
  assert.equal(decide(S(), 15_000, 104.3, 1, 'tick').seekTo, undefined);
  assert.ok(decide(S(), 15_000, 102, 1, 'tick').seekTo !== undefined);
  assert.equal(decide(S(), 15_000, 104.3, 1, 'event').seekTo !== undefined, true, 'event uses the stricter threshold');
});

test('rate returns to 1 once the drift is gone; hysteresis band keeps the rate', () => {
  assert.equal(decide(S(), 15_000, 105.05, 1.06, 'tick').rate, 1);
  assert.equal(decide(S(), 15_000, 104.8, 1.06, 'tick').rate, 1.06);
});

test('paused / on hold → pause and snap to the frozen position', () => {
  assert.deepEqual(decide(S({ playing: false }), 99_999, 100.1, 1.06, 'tick'), { play: false, rate: 1, seekTo: undefined });
  assert.equal(decide(S({ playing: false }), 99_999, 90, 1, 'event').seekTo, 100);
  const held = decide(S({ hold: true }), 99_999, 100, 1, 'tick');
  assert.equal(held.play, false);
});

test('clock offset: choose the lowest-latency sample', () => {
  // true offset +500ms (server ahead). Sample B has the smallest RTT → most accurate.
  const samples = [
    { t0: 1000, t1: 1300, server: 1650 }, // rtt 300, asymmetric
    { t0: 2000, t1: 2020, server: 2510 }, // rtt 20  → offset = 2510 + 10 − 2020 = 500
    { t0: 3000, t1: 3100, server: 3550 },
  ];
  assert.equal(bestOffset(samples), 500);
});
