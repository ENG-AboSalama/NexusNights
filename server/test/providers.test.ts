import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProviderRegistry } from '../src/streaming/provider-registry';
import { PlaybackOrchestrator } from '../src/streaming/playback-orchestrator';
import { ProviderHealthTracker } from '../src/streaming/provider-health';

test('ProviderRegistry: toggling, persistence, and filtering', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusnight-test-'));
  const stateFile = path.join(tmpDir, 'providers-state.json');

  const registry = new ProviderRegistry();
  registry.initPersistence(stateFile);

  // All 3 default supported providers should be enabled initially
  assert.equal(registry.isEnabled('vixsrc'), true);
  assert.equal(registry.isEnabled('vidsrc-mov'), true);
  assert.equal(registry.isEnabled('vidapi'), true);

  const activeBefore = registry.getActive().map((p) => p.id);
  assert.ok(activeBefore.includes('vixsrc'));
  assert.ok(activeBefore.includes('vidsrc-mov'));
  assert.ok(activeBefore.includes('vidapi'));

  // Disable VixSrc
  const ok1 = registry.setEnabled('vixsrc', false);
  assert.equal(ok1, false);
  assert.equal(registry.isEnabled('vixsrc'), false);

  // Active list should no longer include vixsrc
  const activeAfter = registry.getActive().map((p) => p.id);
  assert.ok(!activeAfter.includes('vixsrc'));
  assert.ok(activeAfter.includes('vidsrc-mov'));

  // Check persisted file content
  assert.ok(fs.existsSync(stateFile));
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.deepEqual(saved.disabled, ['vixsrc']);

  // Create a new registry instance pointing to the same file and verify state restoration
  const registry2 = new ProviderRegistry();
  registry2.initPersistence(stateFile);
  assert.equal(registry2.isEnabled('vixsrc'), false);
  assert.equal(registry2.isEnabled('vidsrc-mov'), true);

  // Re-enable VixSrc
  registry2.setEnabled('vixsrc', true);
  assert.equal(registry2.isEnabled('vixsrc'), true);
  const saved2 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.deepEqual(saved2.disabled, []);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('PlaybackOrchestrator: respects disabled providers', async () => {
  const registry = new ProviderRegistry();
  const health = new ProviderHealthTracker();
  const orchestrator = new PlaybackOrchestrator(registry, health);

  // When all enabled:
  const res1 = await orchestrator.resolveMovie(1368337);
  assert.ok(res1.source);
  assert.equal(res1.source.provider, 'VixSrc');

  // Disable VixSrc: VidSrc.mov becomes primary
  registry.setEnabled('vixsrc', false);
  const res2 = await orchestrator.resolveMovie(1368337);
  assert.ok(res2.source);
  assert.equal(res2.source.provider, 'VidSrc.mov');
  assert.ok(!res2.alternatives.some((a) => a.provider === 'VixSrc'));

  // Disable VidSrc.mov as well: VidAPI becomes primary
  registry.setEnabled('vidsrc-mov', false);
  const res3 = await orchestrator.resolveMovie(1368337);
  assert.ok(res3.source);
  assert.equal(res3.source.provider, 'VidAPI');

  // Disable all active providers
  registry.setEnabled('vidapi', false);
  const res4 = await orchestrator.resolveMovie(1368337);
  assert.equal(res4.source, null);
  assert.ok(res4.diagnostics.some((d) => d.code === 'NO_ACTIVE_PROVIDERS'));
});

test('ProviderRegistry: testProvider executes resolution and returns latency', async () => {
  const registry = new ProviderRegistry();
  const res = await registry.testProvider('vixsrc', { kind: 'movie', tmdbId: 1368337 });
  assert.equal(res.providerId, 'vixsrc');
  assert.equal(res.success, true);
  assert.ok(res.durationMs >= 0);
  assert.ok(res.sources.length > 0);
  assert.ok(res.sources[0].url.includes('1368337'));
});
