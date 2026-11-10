import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { loadConfig } from '../src/config';
import { LibraryService } from '../src/library/service';
import { createApp } from '../src/http/app';
import { makeSampleMedia } from '../scripts/make-sample-media';
import type { HlsStatus } from '../src/library/hls';
import type { MediaItem } from '../src/types';

const exec = promisify(execFile);
let tmp: string, svc: LibraryService, server: http.Server, base: string;

const byName = (frag: string): MediaItem => {
  const m = [...svc.store.media.values()].find((x) => x.fileName.includes(frag));
  assert.ok(m, `item ${frag}`);
  return m!;
};

async function waitFor(id: string, finished: boolean): Promise<HlsStatus> {
  for (let i = 0; i < 200; i++) {
    const s = (await (await fetch(`${base}/api/hls/${id}/status`)).json()) as HlsStatus;
    assert.notEqual(s.state, 'error', 'hls job failed');
    if (finished ? s.finished : s.canStart) return s;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('HLS timed out');
}

const probe = async (url: string) => {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', url]);
  return JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; pix_fmt?: string }[]; format: { duration: string } };
};

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dwt-hls-'));
  const media = path.join(tmp, 'media');
  await makeSampleMedia(media);
  // An old-school MPEG-4 AVI with PCM audio: forces the real transcode path.
  await fs.mkdir(path.join(media, 'avi-test'), { recursive: true });
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=duration=6',
    '-c:v', 'mpeg4', '-c:a', 'pcm_s16le', '-t', '6', path.join(media, 'avi-test', 'old movie.avi')]);

  const cfg = loadConfig({ MEDIA_PATH: media, DATA_PATH: path.join(tmp, 'data'), ADMIN_TOKEN: 'secret-token-123' } as NodeJS.ProcessEnv, { loadDotenv: false });
  svc = new LibraryService(cfg);
  await svc.init();
  await svc.scan();
  const { app } = createApp(svc);
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  svc.hls.shutdown();
  server?.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

test('planner: avi/mpeg4/pcm → transcode both', () => {
  const m = byName('old movie');
  assert.equal(m.playback?.mode, 'hls');
  assert.equal(m.playback?.video, 'transcode');
  assert.equal(m.playback?.audio, 'transcode');
});

test('direct play: Range requests work', async () => {
  const m = byName('S02E01');
  assert.equal(m.playback?.mode, 'direct');
  const full = await fetch(`${base}/api/stream/${m.id}`);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  const part = await fetch(`${base}/api/stream/${m.id}`, { headers: { range: 'bytes=0-99' } });
  assert.equal(part.status, 206);
  assert.match(part.headers.get('content-range') ?? '', /^bytes 0-99\/\d+$/);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${base}/api/hls/${m.id}/status`)).status, 409, 'direct files have no HLS');
  const other = byName('2x02');
  assert.equal((await fetch(`${base}/api/stream/${other.id}`)).status, 409, 'non-direct files are not exposed raw');
});

test('HLS remux (copy/copy) produces a decodable VOD', async () => {
  const m = byName('2x02');
  const s = await waitFor(m.id, true);
  assert.equal(s.progress, 1);
  const master = await (await fetch(`${base}/api/hls/${m.id}/master.m3u8`)).text();
  assert.match(master, /^#EXTM3U/);
  assert.match(master, /main\.m3u8/);
  const p = await probe(`${base}/api/hls/${m.id}/master.m3u8`);
  assert.ok(Math.abs(parseFloat(p.format.duration) - 8) < 1.5);
  assert.deepEqual(p.streams.map((x) => x.codec_name).sort(), ['aac', 'h264']);
  const pl = await fetch(`${base}/api/hls/${m.id}/master.m3u8`);
  assert.match(pl.headers.get('content-type') ?? '', /mpegurl/);
});

test('HLS with two audio tracks → alternate audio renditions', async () => {
  const m = byName('04.mp4');
  await waitFor(m.id, true);
  const master = await (await fetch(`${base}/api/hls/${m.id}/master.m3u8`)).text();
  const media = master.match(/#EXT-X-MEDIA:TYPE=AUDIO[^\n]*/g) ?? [];
  assert.equal(media.length, 2, master);
  assert.ok(media.some((l) => /LANGUAGE="ar"/.test(l)));
  assert.ok(media.some((l) => /DEFAULT=YES/.test(l)));
  const p = await probe(`${base}/api/hls/${m.id}/master.m3u8`);
  assert.ok(p.streams.some((s) => s.codec_type === 'video'));
});

test('HLS transcode path: h264/yuv420p + aac out', async () => {
  const m = byName('old movie');
  await waitFor(m.id, true);
  const p = await probe(`${base}/api/hls/${m.id}/master.m3u8`);
  const v = p.streams.find((s) => s.codec_type === 'video')!;
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(p.streams.find((s) => s.codec_type === 'audio')!.codec_name, 'aac');
  assert.ok(Math.abs(parseFloat(p.format.duration) - 6) < 1.5);
});

test('finished jobs are reused from disk after a "restart"', async () => {
  const m = byName('2x02');
  const fresh = new LibraryService(svc.cfg);
  await fresh.init();
  await fresh.store.load();
  const item = fresh.store.media.get(m.id)!;
  const s = await fresh.hls.status(item);
  assert.equal(s.finished, true);
});

test('HLS file serving is strict', async () => {
  const m = byName('2x02');
  for (const f of ['..%2f..%2fx.ts', 'evil.txt', 'master.m3u8.bak', '%2e%2e%2fmaster.m3u8', '.done', 'nope.ts']) {
    assert.equal((await fetch(`${base}/api/hls/${m.id}/${f}`)).status, 404, f);
  }
  assert.equal((await fetch(`${base}/api/hls/zzzz/master.m3u8`)).status, 404);
  const seg = (await (await fetch(`${base}/api/hls/${m.id}/main.m3u8`)).text()).split('\n').find((l) => l.endsWith('.ts'))!;
  const r = await fetch(`${base}/api/hls/${m.id}/${seg}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'video/mp2t');
});

test('batch endpoint', async () => {
  const a = byName('S02E01'), b = byName('2x02');
  const r = (await (await fetch(`${base}/api/media?ids=${b.id},bad,${a.id},aaaaaaaaaaaa`)).json()) as { items: { id: string }[] };
  assert.deepEqual(r.items.map((i) => i.id), [b.id, a.id]);
});
