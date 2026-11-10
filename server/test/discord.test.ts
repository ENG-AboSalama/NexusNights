import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../src/config';
import { LibraryService } from '../src/library/service';
import { createApp } from '../src/http/app';

let tmp: string, mock: http.Server, srv: http.Server, base: string, lastBody = '';
const HASH = 'a'.repeat(32);

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dwt-dc-'));
  mock = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      if (req.url === '/api/oauth2/token') {
        lastBody = b;
        const ok = new URLSearchParams(b).get('code') === 'goodcode123';
        res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(ok ? { access_token: 'tok_abc' } : { error: 'invalid_grant' }));
      }
      if (req.url?.startsWith('/avatars/')) {
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r));
  const m = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  const cfg = loadConfig(
    { MEDIA_PATH: path.join(tmp, 'media'), DATA_PATH: path.join(tmp, 'data'), DISCORD_CLIENT_ID: '1234567890', DISCORD_CLIENT_SECRET: 's3cret-value', DISCORD_API_BASE: `${m}/api`, DISCORD_CDN_BASE: m } as NodeJS.ProcessEnv,
    { loadDotenv: false },
  );
  const svc = new LibraryService(cfg);
  await svc.init();
  srv = createApp(svc).app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
after(async () => {
  srv.close();
  mock.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

const post = (body: unknown) => fetch(`${base}/api/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('config exposes only the public client id', async () => {
  const txt = await (await fetch(`${base}/api/config`)).text();
  assert.deepEqual(JSON.parse(txt), { discordClientId: '1234567890', guestAllowed: true, roleScope: false });
  assert.ok(!txt.includes('s3cret'));
});

test('token exchange: success, secret stays server-side', async () => {
  const r = await post({ code: 'goodcode123' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { access_token: 'tok_abc' });
  const sent = new URLSearchParams(lastBody);
  assert.equal(sent.get('client_secret'), 's3cret-value');
  assert.equal(sent.get('grant_type'), 'authorization_code');
});

test('token exchange: rejects bad input and upstream failure', async () => {
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ code: 'x' })).status, 400);
  assert.equal((await post({ code: 'a'.repeat(600) })).status, 400);
  assert.equal((await post({ code: { $ne: 1 } })).status, 400);
  assert.equal((await post({ code: 'wrongcode999' })).status, 502);
});

test('avatar proxy validates ids and caches', async () => {
  const ok = await fetch(`${base}/api/avatar/123456789012345678/${HASH}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type') ?? '', /image\/png/);
  for (const p of ['/api/avatar/12/' + HASH, '/api/avatar/123456789012345678/zzzz', '/api/avatar/123456789012345678/..%2f..%2fx']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});
