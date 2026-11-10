import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { loadConfig, type Config } from '../src/config';
import { LibraryService } from '../src/library/service';
import { createApp } from '../src/http/app';
import { makeSampleMedia } from '../scripts/make-sample-media';
import { startMockTmdb, type MockTmdb } from './mock-tmdb';
import type { EpisodeDetail, HomeResponse, TitleDetail, TitleSummary } from '../src/http/api-types';

let tmp: string;
let mediaDir: string;
let tmdb: MockTmdb;
let svc: LibraryService;
let server: http.Server;
let base: string;
let adminToken: string;

const cfgFor = (dataDir: string, extra: Record<string, string> = {}): Config =>
  loadConfig(
    { MEDIA_PATH: mediaDir, DATA_PATH: dataDir, TMDB_API_KEY: 'testkey', TMDB_BASE_URL: tmdb.baseUrl, TMDB_IMAGE_BASE: tmdb.imageBase, ADMIN_TOKEN: 'secret-token-123', ...extra } as NodeJS.ProcessEnv,
    { loadDotenv: false },
  );

const get = async <T>(p: string) => {
  const r = await fetch(base + p);
  return { status: r.status, json: (await r.json().catch(() => null)) as T, headers: r.headers };
};

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dwt-'));
  mediaDir = path.join(tmp, 'media');
  await makeSampleMedia(mediaDir);
  tmdb = await startMockTmdb();
  svc = new LibraryService(cfgFor(path.join(tmp, 'data')));
  await svc.init();
  await svc.scan();
  const { app, adminToken: t } = createApp(svc);
  adminToken = t;
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  await tmdb?.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

test('scanner finds titles and parses messy names', async () => {
  const lib = await get<{ titles: TitleSummary[] }>('/api/library');
  const names = lib.json.titles.map((t) => t.title).sort();
  assert.deepEqual(names, ['Inception', 'Some Random Show', 'The Boys']);

  const boys = lib.json.titles.find((t) => t.title === 'The Boys')!;
  const d = await get<TitleDetail>(`/api/titles/${boys.id}`);
  assert.equal(d.json.kind, 'series');
  assert.equal(d.json.seasons.length, 1);
  assert.equal(d.json.seasons[0].season, 2);
  assert.deepEqual(d.json.seasons[0].episodes.map((e) => e.episode), [1, 2, 3, 4]);

  const some = lib.json.titles.find((t) => t.title === 'Some Random Show')!;
  const sd = await get<TitleDetail>(`/api/titles/${some.id}`);
  assert.deepEqual(sd.json.seasons[0].episodes.map((e) => e.episode), [1, 2], 'plain-order fallback');
  assert.equal(sd.json.seasons[0].episodes[0].title, 'Episode 1');

  const inc = lib.json.titles.find((t) => t.title === 'Inception')!;
  assert.equal(inc.kind, 'movie');
  assert.ok(inc.mediaId);
});

test('TMDB metadata: localized titles, episode names, images', async () => {
  const lib = await get<{ titles: TitleSummary[] }>('/api/library?lang=ar');
  const boys = lib.json.titles.find((t) => t.year === 2019)!;
  assert.equal(boys.title, 'الأولاد');
  const en = (await get<TitleDetail>(`/api/titles/${boys.id}?lang=en`)).json;
  const ar = (await get<TitleDetail>(`/api/titles/${boys.id}?lang=ar`)).json;
  assert.equal(en.title, 'The Boys');
  assert.equal(en.seasons[0].episodes[3].title, 'Nothing Like It in the World');
  assert.equal(ar.seasons[0].episodes[0].title, 'الرحلة الكبيرة');
  assert.equal(ar.seasons[0].name, 'الموسم 2');
  assert.equal(en.rating, 8.4);

  for (const url of [en.posterUrl!, en.backdropUrl!, en.seasons[0].episodes[0].stillUrl!]) {
    const r = await fetch(base + url);
    assert.equal(r.status, 200, url);
    assert.match(r.headers.get('content-type') ?? '', /image\/jpeg/);
  }
  const activityImage = await fetch(`${base}/api/images/tmdb/poster/inc.jpg`);
  assert.equal(activityImage.status, 200);
  assert.match(activityImage.headers.get('content-type') ?? '', /image\/jpeg/);
  assert.equal((await fetch(`${base}/api/images/tmdb/poster/%2e%2e%2fsecret.jpg`)).status, 404);

  // Second request is served from the disk cache, not TMDB.
  const before = tmdb.calls.filter((c) => c.startsWith('/t/p/')).length;
  await fetch(base + en.posterUrl!);
  assert.equal(tmdb.calls.filter((c) => c.startsWith('/t/p/')).length, before);

  const unmatched = (await get<{ titles: TitleSummary[] }>('/api/library')).json.titles.find((t) => t.title === 'Some Random Show')!;
  assert.equal(unmatched.posterUrl, null);
});

test('ffprobe + playback plan', async () => {
  const boys = (await get<{ titles: TitleSummary[] }>('/api/library')).json.titles.find((t) => t.title === 'The Boys')!;
  const eps = (await get<TitleDetail>(`/api/titles/${boys.id}`)).json.seasons[0].episodes;
  const d = await Promise.all(eps.map(async (e) => (await get<EpisodeDetail>(`/api/media/${e.id}`)).json));
  assert.equal(d[0].playback?.mode, 'direct', 'faststart h264/aac mp4 → direct');
  assert.equal(d[1].playback?.mode, 'hls', 'moov at end → hls');
  assert.equal(d[1].playback?.video, 'copy');
  assert.equal(d[2].playback?.mode, 'hls', 'mkv → hls (copy)');
  assert.equal(d[3].playback?.mode, 'hls', 'two audio tracks → hls');
  assert.equal(d[3].audioTracks.length, 2);
  assert.deepEqual(d[3].audioTracks.map((a) => a.lang), ['en', 'ar']);
  assert.ok(d[0].runtimeSec! >= 7 && d[0].runtimeSec! <= 9);
  assert.equal(d[0].width, 320);
  assert.equal(d[0].prevId, null);
  assert.equal(d[0].nextId, d[1].id);
  assert.equal(d[3].nextId, null);
});

test('thumbnails and seek sprites exist and are served', async () => {
  const boys = (await get<{ titles: TitleSummary[] }>('/api/library')).json.titles.find((t) => t.title === 'The Boys')!;
  const first = (await get<TitleDetail>(`/api/titles/${boys.id}`)).json.seasons[0].episodes[0];
  const d = (await get<EpisodeDetail>(`/api/media/${first.id}`)).json;
  assert.ok(d.thumbUrl);
  const t = await fetch(base + d.thumbUrl!);
  assert.equal(t.status, 200);
  assert.ok((await t.arrayBuffer()).byteLength > 1000);

  assert.ok(d.sprite, 'sprite present');
  assert.equal(d.sprite!.intervalSec, 2);
  assert.equal(d.sprite!.count, 4);
  assert.equal(d.sprite!.tileW, 160);
  assert.equal(d.sprite!.tileH, 90);
  const s = await fetch(base + d.sprite!.url);
  assert.equal(s.status, 200);
  assert.ok((await s.arrayBuffer()).byteLength > 1000);
});

test('subtitles: srt→vtt, cp1256 Arabic, embedded track', async () => {
  const boys = (await get<{ titles: TitleSummary[] }>('/api/library')).json.titles.find((t) => t.title === 'The Boys')!;
  const eps = (await get<TitleDetail>(`/api/titles/${boys.id}`)).json.seasons[0].episodes;
  const e1 = (await get<EpisodeDetail>(`/api/media/${eps[0].id}`)).json;
  assert.deepEqual(e1.subtitles.map((s) => s.lang).sort(), ['ar', 'en']);
  const en = e1.subtitles.find((s) => s.lang === 'en')!;
  assert.equal(en.label, 'English');
  const enText = await (await fetch(base + en.url)).text();
  assert.ok(enText.startsWith('WEBVTT'));
  assert.match(enText, /00:00:01\.000 --> 00:00:03\.500/);
  assert.ok(!enText.includes('\uFEFF'));
  const arRes = await fetch(base + e1.subtitles.find((s) => s.lang === 'ar')!.url);
  assert.match(arRes.headers.get('content-type') ?? '', /text\/vtt/);
  assert.ok((await arRes.text()).includes('مرحبا'), 'windows-1256 decoded correctly');

  const e3 = (await get<EpisodeDetail>(`/api/media/${eps[2].id}`)).json;
  const emb = e3.subtitles.find((s) => s.source === 'embedded')!;
  assert.ok(emb, 'embedded subtitle listed');
  const embText = await (await fetch(base + emb.url)).text();
  assert.ok(embText.startsWith('WEBVTT') && embText.includes('Embedded line'));

  const inc = (await get<{ titles: TitleSummary[] }>('/api/library')).json.titles.find((t) => t.title === 'Inception')!;
  const incD = (await get<EpisodeDetail>(`/api/media/${inc.mediaId}`)).json;
  assert.equal(incD.subtitles.length, 1, 'root-level movie picks up its .srt');
});

test('home payload', async () => {
  const h = (await get<HomeResponse>('/api/home?lang=en')).json;
  assert.ok(h.hero?.backdropUrl);
  assert.deepEqual(h.rows.map((r) => r.key), ['episodes', 'recently-added']);
});

test('security: no paths leak, bad ids rejected, admin protected', async () => {
  const boys = (await get<{ titles: TitleSummary[] }>('/api/library')).json.titles.find((t) => t.title === 'The Boys')!;
  const bodies = await Promise.all(
    ['/api/library', '/api/home', `/api/titles/${boys.id}`, '/api/health', '/api/library/status'].map(async (p) => JSON.stringify((await get(p)).json)),
  );
  for (const b of bodies) {
    assert.ok(!b.includes(tmp), 'absolute path leaked');
    assert.ok(!/\.(mp4|mkv|srt)/i.test(b), 'file name leaked');
  }
  // Raw request: fetch() would normalise "/../" away before it reaches the server.
  const rawStatus = (p: string) => new Promise<number>((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: p, method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    r.on('error', reject);
    r.end();
  });
  for (const p of ['/api/thumbs/../../x.jpg', '/api/thumbs/../../../etc/passwd', '/api/hls/../../x/master.m3u8']) assert.equal(await rawStatus(p), 404, p);
  for (const p of ['/api/media/zzzz', '/api/media/..%2f..%2fetc%2fpasswd', '/api/titles/not-an-id', '/api/subtitles/abc/ext-0.vtt', `/api/subtitles/${boys.id}/ext-99.vtt`, '/api/images/poster/..%2f..', '/api/images/other/aaaaaaaaaaaa']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
  }
  assert.equal((await fetch(base + '/api/library/rescan', { method: 'POST' })).status, 401);
  assert.equal((await fetch(base + '/api/library/rescan', { method: 'POST', headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(base + '/api/admin/library')).status, 401);
  const ok = await fetch(base + '/api/library/rescan', { method: 'POST', headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(ok.status, 202);
  await svc.scan(); // let the triggered scan finish
  const adm = await fetch(base + '/api/admin/library', { headers: { 'x-admin-token': adminToken } });
  assert.equal(adm.status, 200);
  assert.ok(!(await adm.text()).includes(tmp));
});

test('rescan is incremental: nothing is re-probed or re-generated', async () => {
  const before = await fs.stat(path.join(tmp, 'data', 'cache', 'thumbs')).then(async (d) => (await fs.readdir(path.join(tmp, 'data', 'cache', 'thumbs'))).length);
  const calls = tmdb.calls.length;
  await svc.scan();
  const after = (await fs.readdir(path.join(tmp, 'data', 'cache', 'thumbs'))).length;
  assert.equal(after, before);
  assert.equal(tmdb.calls.length, calls, 'TMDB responses came from the on-disk cache');
  assert.equal(svc.store.media.size, 7);
});

test('TMDB down → falls back to metadata.json + filenames, never crashes', async () => {
  const dataDir = path.join(tmp, 'data-offline');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, 'metadata.json'),
    JSON.stringify({
      '_comment': 'ignored',
      'the-boys': {
        title: { en: 'The Boys (override)', ar: 'الأولاد (يدوي)' },
        overview: 'Manual overview',
        year: 2019,
        episodes: { s02e04: { title: 'Manual Ep 4', overview: 'x', runtimeMin: 57 }, S2E3: { title: 'Manual Ep 3' } },
      },
      'broken': { tmdbId: 'nope' },
    }),
  );
  const offline = new LibraryService(cfgFor(dataDir, { TMDB_BASE_URL: 'http://127.0.0.1:9/3' }));
  await offline.init();
  await offline.scan();
  const { app } = createApp(offline);
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const lib = (await (await fetch(b + '/api/library?lang=ar')).json()) as { titles: TitleSummary[] };
    const boys = lib.titles.find((t) => t.year === 2019)!;
    assert.equal(boys.title, 'الأولاد (يدوي)');
    const det = (await (await fetch(`${b}/api/titles/${boys.id}?lang=en`)).json()) as TitleDetail;
    assert.equal(det.title, 'The Boys (override)');
    assert.equal(det.seasons[0].episodes[3].title, 'Manual Ep 4');
    assert.equal(det.seasons[0].episodes[2].title, 'Manual Ep 3', '"S2E3" key style accepted');
    assert.equal(det.seasons[0].episodes[1].title, 'Nothing Like It In the World', 'title hint from filename');
    assert.equal(det.seasons[0].episodes[0].title, 'Episode 1');
    assert.equal(det.posterUrl, null);
    assert.ok(offline.status.warnings.some((w) => w.includes('TMDB failed')));
    assert.ok(offline.status.warnings.some((w) => w.includes('"broken"')), 'invalid override reported');
  } finally {
    srv.close();
  }
});
