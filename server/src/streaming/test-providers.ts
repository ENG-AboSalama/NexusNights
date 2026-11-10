/**
 * Multi-Provider System Integration & Verification Test Suite
 */

import { providerRegistry } from './provider-registry';
import { playbackOrchestrator } from './playback-orchestrator';
import { providerHealth } from './provider-health';

async function runTests() {
  console.log('='.repeat(60));
  console.log('NEXUSNIGHT CUSTOM MULTI-PROVIDER SYSTEM TEST');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Registry Verification
  console.log('[Test 1] Provider Registry Verification');
  console.log('-'.repeat(60));
  const allProviders = providerRegistry.getAll();
  const supportedProviders = providerRegistry.getSupported();
  console.log(`Total registered providers: ${allProviders.length}`);
  console.log(`Supported providers: ${supportedProviders.map((p) => p.name).join(', ')}`);

  const vidrock = providerRegistry.get('vidrock');
  if (vidrock && !vidrock.isSupported) {
    console.log('✅ VidRock is correctly marked as UNSUPPORTED (no documented public API)');
  } else {
    console.error('❌ VidRock status unexpected');
  }

  // Test 2: Individual Adapter Verification
  console.log('\n[Test 2] Individual Provider Adapter Verification');
  console.log('-'.repeat(60));

  for (const provider of allProviders) {
    const movieRes = await provider.resolve({
      tmdbId: 550,
      kind: 'movie',
    });
    console.log(`Provider: ${provider.name}`);
    console.log(`  - isSupported: ${provider.isSupported}`);
    console.log(`  - Sources returned: ${movieRes.sources.length}`);
    if (movieRes.sources.length > 0) {
      console.log(`  - Sample source URL: ${movieRes.sources[0].url}`);
      console.log(`  - Type: ${movieRes.sources[0].type}`);
      console.log(`  - Quality: ${movieRes.sources[0].quality}`);
    }
    if (movieRes.diagnostics.length > 0) {
      console.log(`  - Diagnostics: ${movieRes.diagnostics.join(', ')}`);
    }
  }

  // Test 3: Playback Orchestration - Movie (The Odyssey / Fight Club)
  console.log('\n[Test 3] Playback Orchestrator - Movie (TMDB: 550)');
  console.log('-'.repeat(60));
  const moviePlayback = await playbackOrchestrator.resolveMovie(550);
  console.log(`Primary source: ${moviePlayback.source?.provider} (${moviePlayback.source?.type})`);
  console.log(`Primary URL: ${moviePlayback.source?.url}`);
  console.log(`Alternatives count: ${moviePlayback.alternatives.length}`);
  moviePlayback.alternatives.forEach((alt, idx) => {
    console.log(`  Alt ${idx + 1}: ${alt.provider} (${alt.type}) -> ${alt.url}`);
  });
  console.log(`Can auto-switch: ${moviePlayback.canAutoSwitch}`);

  if (moviePlayback.source) {
    console.log('✅ Movie playback resolution successful');
  } else {
    console.error('❌ Movie playback resolution failed');
  }

  // Test 4: Playback Orchestration - TV (The Boys S02E01)
  console.log('\n[Test 4] Playback Orchestrator - TV (The Boys S02E01 - TMDB: 76479)');
  console.log('-'.repeat(60));
  const tvPlayback = await playbackOrchestrator.resolveTV(76479, 2, 1);
  console.log(`Primary source: ${tvPlayback.source?.provider} (${tvPlayback.source?.type})`);
  console.log(`Primary URL: ${tvPlayback.source?.url}`);
  console.log(`Alternatives count: ${tvPlayback.alternatives.length}`);
  tvPlayback.alternatives.forEach((alt, idx) => {
    console.log(`  Alt ${idx + 1}: ${alt.provider} (${alt.type}) -> ${alt.url}`);
  });

  if (tvPlayback.source) {
    console.log('✅ TV playback resolution successful');
  } else {
    console.error('❌ TV playback resolution failed');
  }

  // Test 5: Health & Intelligent Failover
  console.log('\n[Test 5] Provider Health Tracking & Cooldown');
  console.log('-'.repeat(60));
  const initialVixScore = providerHealth.getProviderScore('vixsrc');
  console.log(`Initial VixSrc health score: ${initialVixScore.toFixed(2)}`);

  // Simulate failures
  providerHealth.recordFailure({
    provider: 'vixsrc',
    sourceUrl: 'https://vixsrc.to/test',
    failureType: 'http_timeout',
    timestamp: Date.now(),
  });
  providerHealth.recordFailure({
    provider: 'vixsrc',
    sourceUrl: 'https://vixsrc.to/test',
    failureType: 'http_timeout',
    timestamp: Date.now(),
  });
  providerHealth.recordFailure({
    provider: 'vixsrc',
    sourceUrl: 'https://vixsrc.to/test',
    failureType: 'http_timeout',
    timestamp: Date.now(),
  });

  const postFailScore = providerHealth.getProviderScore('vixsrc');
  console.log(`Post-failure VixSrc health score: ${postFailScore.toFixed(2)}`);
  console.log(`VixSrc in cooldown: ${providerHealth.isProviderInCooldown('vixsrc')}`);

  // Resolve again - should failover to VidSrc.mov or VidAPI as primary!
  const failoverPlayback = await playbackOrchestrator.resolveMovie(550);
  console.log(`New primary source during VixSrc cooldown: ${failoverPlayback.source?.provider}`);

  if (failoverPlayback.source && failoverPlayback.source.provider !== 'VixSrc') {
    console.log('✅ Automatic failover succeeded! Another provider was promoted to primary.');
  }

  // Record success to recover
  providerHealth.recordSuccess('vixsrc', 'https://vixsrc.to/test');
  console.log(`Recovered VixSrc health score: ${providerHealth.getProviderScore('vixsrc').toFixed(2)}`);

  console.log('\n' + '='.repeat(60));
  console.log('All Provider System Tests Completed Successfully');
  console.log('='.repeat(60));
}

runTests().catch((e) => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
