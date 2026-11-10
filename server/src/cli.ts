import { loadConfig } from './config';
import { LibraryService } from './library/service';
import { Presenter } from './http/present';

const fmt = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '--:--');

async function main() {
  const cmd = process.argv[2] ?? 'list';
  const lang = process.argv[3] ?? 'en';
  const svc = new LibraryService(loadConfig());
  await svc.init();

  if (cmd === 'scan') {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const s = svc.status;
      if (s.phase) process.stdout.write(`\r  ${s.phase.padEnd(9)} ${s.done}/${s.total}   `);
    }, 400);
    await svc.scan();
    clearInterval(timer);
    console.log(`\n✓ scanned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    svc.status.warnings.forEach((w) => console.log('  ! ' + w));
  }

  const p = new Presenter(svc);
  for (const t of [...svc.store.titles.values()].sort((a, b) => a.nameGuess.localeCompare(b.nameGuess))) {
    const s = p.summary(t, lang);
    console.log(`\n${s.kind === 'series' ? '📺' : '🎬'} ${s.title}${s.year ? ` (${s.year})` : ''}  [${t.meta?.source ?? 'no-meta'}]  poster:${s.posterUrl ? '✓' : '–'} backdrop:${s.backdropUrl ? '✓' : '–'}`);
    for (const m of svc.store.itemsOf(t.id)) {
      const e = p.episode(m, lang);
      const d = p.detail(m, lang);
      const tag = m.season !== undefined ? `S${String(m.season).padStart(2, '0')}E${String(m.episode).padStart(2, '0')}${m.episodeEnd ? `-E${m.episodeEnd}` : ''}` : '     ';
      const subs = d.subtitles.map((x) => x.lang ?? '?').join(',') || '–';
      console.log(`   ${tag}  ${e.title.slice(0, 42).padEnd(42)} ${fmt(e.runtimeSec)}  ${(m.playback?.mode ?? '?').padEnd(6)} thumb:${m.assets.thumb ? '✓' : '–'} sprite:${m.assets.sprite ? '✓' : '–'} subs:${subs}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
