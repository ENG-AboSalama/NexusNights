import { loadConfig } from './config';
import { LibraryService } from './library/service';
import http from 'node:http';
import { createApp } from './http/app';
import { attachRealtime } from './realtime/hub';

async function main() {
  const cfg = loadConfig();
  const svc = new LibraryService(cfg);
  await svc.init();

  const { app, adminToken, sessions, progress } = createApp(svc);
  const server = http.createServer(app);
  const rt = attachRealtime(server, svc, sessions);
  server.listen(cfg.port, () => {
    console.log(`▶ API listening on http://localhost:${cfg.port}`);
    console.log(`  library: ${svc.store.titles.size} titles / ${svc.store.media.size} files (from last index)`);
    console.log(`  Discord: ${cfg.discord.clientId && cfg.discord.clientSecret ? 'configured' : 'NOT configured (set DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)'} · guest rooms: ${cfg.allowGuest ? 'allowed (?room=…)' : 'off'}`);
    console.log(`  TMDB: ${svc.tmdb.enabled ? 'enabled' : 'disabled (set TMDB_API_KEY) → using filenames + data/metadata.json'}`);
    if (!cfg.adminToken) console.log(`  admin token (random this run, set ADMIN_TOKEN to pin it): ${adminToken}`);
  });

  if (cfg.scanOnStart) {
    svc.scan().then(() => {
      const s = svc.status;
      console.log(`✓ scan finished: ${svc.store.titles.size} titles, ${svc.store.media.size} files, ${s.warnings.length} warning(s)`);
    });
  }

  const shutdown = () => {
    svc.hls.shutdown();
    void Promise.all([rt.close(), progress.flush()]).finally(() => server.close(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
