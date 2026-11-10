import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressStore, parseContentIdentity } from '../src/realtime/progress';
import { loadConfig } from '../src/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('parseContentIdentity: correctly normalizes local and streaming IDs', () => {
  // Movie streaming ID
  const m1 = parseContentIdentity('streaming-movie-1368337');
  assert.equal(m1.contentKey, 'movie-1368337');
  assert.equal(m1.tmdbId, 1368337);
  assert.equal(m1.kind, 'movie');
  assert.equal(m1.season, null);
  assert.equal(m1.episode, null);

  // TV streaming ID
  const tv1 = parseContentIdentity('streaming-tv-76479-1-2');
  assert.equal(tv1.contentKey, 'tv-76479-s1e2');
  assert.equal(tv1.tmdbId, 76479);
  assert.equal(tv1.kind, 'tv');
  assert.equal(tv1.season, 1);
  assert.equal(tv1.episode, 2);

  // Canonical movie key
  const m2 = parseContentIdentity('movie-550');
  assert.equal(m2.contentKey, 'movie-550');
  assert.equal(m2.tmdbId, 550);
  assert.equal(m2.lookupId, 'streaming-movie-550');

  // Local media ID
  const loc = parseContentIdentity('0123456789ab');
  assert.equal(loc.contentKey, '0123456789ab');
  assert.equal(loc.tmdbId, null);
});

test('ProgressStore: tracks local and streaming progress without provider duplication', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusnight-progress-'));
  const cfg = loadConfig({ DATA_PATH: tmpDir });
  const store = new ProgressStore(cfg);

  const userAlice = 'user_alice_123';
  const userBob = 'user_bob_456';

  // 1. User Alice watches movie 1368337 on VixSrc
  store.put(userAlice, 'streaming-movie-1368337', 1200, 7200, {
    provider: 'VixSrc',
    tmdbId: 1368337,
    kind: 'movie',
  });

  // Verify stored progress
  const p1 = store.getByMedia(userAlice, 'streaming-movie-1368337');
  assert.ok(p1);
  assert.equal(p1.t, 1200);
  assert.equal(p1.d, 7200);
  assert.equal(p1.provider, 'VixSrc');

  // Querying via canonical key gives the same progress
  const pCanonical = store.getByMedia(userAlice, 'movie-1368337');
  assert.ok(pCanonical);
  assert.equal(pCanonical.t, 1200);

  // 2. Next time, Alice watches the same movie on VidAPI (or VidSrc.mov)
  store.put(userAlice, 'streaming-movie-1368337', 2400, 7200, {
    provider: 'VidAPI',
    tmdbId: 1368337,
    kind: 'movie',
  });

  const p2 = store.getByMedia(userAlice, 'streaming-movie-1368337');
  assert.equal(p2?.t, 2400);
  assert.equal(p2?.provider, 'VidAPI');

  // Verify that Continue Watching does NOT duplicate the movie
  const continueKeys = store.getContinueWatchingIds(userAlice);
  const movieMatches = continueKeys.filter((k) => k.includes('1368337'));
  assert.equal(movieMatches.length, 1);

  // 3. User Bob has an isolated history
  const bobKeys = store.getContinueWatchingIds(userBob);
  assert.deepEqual(bobKeys, []);

  // 4. TV Show progress: The Boys S01E01 watched, then S01E02 watched
  // S01E01 watched 30 mins
  store.put(userAlice, 'streaming-tv-76479-1-1', 1800, 3600, {
    provider: 'local',
    tmdbId: 76479,
    kind: 'tv',
    season: 1,
    episode: 1,
  });

  // Then S01E01 is completed (>= 90%)
  store.put(userAlice, 'streaming-tv-76479-1-1', 3400, 3600, {
    provider: 'local',
    tmdbId: 76479,
    kind: 'tv',
    season: 1,
    episode: 1,
    completed: true,
  });

  // S01E02 watched 15 mins
  store.put(userAlice, 'streaming-tv-76479-1-2', 900, 3600, {
    provider: 'VixSrc',
    tmdbId: 76479,
    kind: 'tv',
    season: 1,
    episode: 2,
  });

  // Continue Watching should only show S01E02 for The Boys (completed E01 is omitted)
  const aliceCW = store.getContinueWatchingIds(userAlice);
  assert.ok(!aliceCW.includes('streaming-tv-76479-1-1'));
  assert.ok(aliceCW.includes('streaming-tv-76479-1-2'));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ProgressStore: persistence across flush and reload', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusnight-progress-persist-'));
  const cfg = loadConfig({ DATA_PATH: tmpDir });
  const store1 = new ProgressStore(cfg);

  store1.put('user1', 'movie-999', 500, 6000, { provider: 'VixSrc' });
  await store1.flush();

  // Create a second store instance and load from the same file
  const store2 = new ProgressStore(cfg);
  await store2.load();

  const loaded = store2.getByMedia('user1', 'movie-999');
  assert.ok(loaded);
  assert.equal(loaded.t, 500);
  assert.equal(loaded.d, 6000);
  assert.equal(loaded.provider, 'VixSrc');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
