#!/usr/bin/env node
/**
 * Test TMDB API directly to verify key and response
 */

async function testTMDB() {
  const apiKey = process.env.TMDB_API_KEY;
  
  if (!apiKey) {
    console.error('ERROR: TMDB_API_KEY not set');
    process.exit(1);
  }

  console.log('TMDB API Key:', apiKey.substring(0, 20) + '...');
  console.log();

  const tests = [
    { id: 603, name: 'The Matrix' },
    { id: 550, name: 'Fight Club' },
  ];

  for (const test of tests) {
    console.log(`Testing Movie ID ${test.id} (${test.name})`);
    console.log('-'.repeat(60));
    
    const url = `https://api.themoviedb.org/3/movie/${test.id}?api_key=${apiKey}`;
    
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      
      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log(`Content-Type: ${response.headers.get('content-type')}`);
      
      const text = await response.text();
      
      if (response.ok) {
        const movie = JSON.parse(text);
        console.log('✅ SUCCESS');
        console.log(`   Title: ${movie.title}`);
        console.log(`   Release: ${movie.release_date}`);
        console.log(`   Status: ${movie.status}`);
        console.log(`   ID: ${movie.id}`);
      } else {
        console.log('❌ FAILED');
        console.log(`   Response: ${text.substring(0, 200)}`);
      }
    } catch (error) {
      console.log('❌ ERROR:', (error as Error).message);
    }
    
    console.log();
  }
}

testTMDB().catch(console.error);
