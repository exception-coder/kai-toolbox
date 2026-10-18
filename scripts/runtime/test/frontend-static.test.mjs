import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { buildRelease, sourceIdentity } from '../frontend/build.mjs';
import { prepareRelease, publishRelease, readActive, verifyRelease, PREFIX } from '../frontend/releases.mjs';
import { createFrontendServer } from '../frontend/server.mjs';
import { settingsFrom } from '../config.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'forge static 中文 '));
  const state = { ready: true, version: 'a'.repeat(24), buildState: 'ready' };
  const ports = {};
  const backend = http.createServer((request, response) => {
    if (request.url === '/api/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: first\n\n');
      setTimeout(() => response.end('data: last\n\n'), 200); return;
    }
    const chunks = []; request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      response.setHeader('set-cookie', 'demo=1; HttpOnly');
      response.setHeader('x-test-forwarded-host', request.headers['x-forwarded-host'] || '');
      response.setHeader('x-test-forwarded-proto', request.headers['x-forwarded-proto'] || '');
      response.end(request.url + ':' + Buffer.concat(chunks).toString());
    });
  });
  backend.on('upgrade', (request, socket, head) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    if (head.length) socket.write(head);
    socket.on('data', bytes => socket.write(bytes));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  ports.backendPort = ports.controlPort = backend.address().port;
  const server = createFrontendServer({ home, state: () => state, ...ports });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const sockets = new Set();
  for (const listener of [backend, server]) listener.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  });
  t.after(() => { for (const socket of sockets) socket.destroy(); backend.close(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const release = async (version, text = 'entry') => {
    const stage = join(home, `candidate-${version}`); await mkdir(join(stage, 'assets'), { recursive: true });
    await writeFile(join(stage, 'index.html'), `<html><head><script>document.querySelector('script[src="/@vite/client"]')</script><script type="module" src="${PREFIX}/releases/${version}/assets/main.js"></script></head><body>home</body></html>`);
    await writeFile(join(stage, 'assets/main.js'), text.repeat(1000));
    await prepareRelease(stage, version); await publishRelease(home, stage, { version });
    return join(home, 'releases', version);
  };
  return { home, state, url, release, server };
}

test('serves complete releases, SPA routes, compression, cache validation and old chunks after switch', async t => {
  const f = await fixture(t); const old = f.state.version;
  await f.release(old);
  const html = await fetch(f.url + '/tools/fore-consult');
  assert.equal(html.headers.get('cache-control'), 'no-cache');
  assert.match(await html.text(), /forge-frontend-version/);
  const asset = `${PREFIX}/releases/${old}/assets/main.js`;
  const response = await fetch(f.url + asset, { headers: { 'accept-encoding': 'br' } });
  assert.equal(response.headers.get('content-encoding'), 'br');
  assert.match(response.headers.get('cache-control'), /immutable/);
  assert.equal((await response.text()).length, 5000);
  assert.equal((await fetch(f.url + asset, { headers: { 'if-none-match': response.headers.get('etag'), 'accept-encoding': 'br' } })).status, 304);
  await f.release('b'.repeat(24)); f.state.version = 'b'.repeat(24);
  assert.equal((await fetch(f.url + asset)).status, 200);
  assert.equal((await fetch(f.url + '/src/main.tsx')).status, 404);
  assert.equal((await fetch(f.url + '/.release.json')).status, 404);
  assert.equal((await fetch(f.url + `${PREFIX}/releases/${old}/%2e%2e%2factive.json`)).status, 404);
  const range = await fetch(f.url + asset, { headers: { range: 'bytes=0-4' } });
  assert.equal(range.status, 206); assert.equal(await range.text(), 'entry');
  assert.equal((await fetch(f.url + asset, { headers: { range: 'bytes=-' } })).status, 416);
});

test('streams API request bodies and SSE, preserves cookies, and rewrites supervisor paths', async t => {
  const f = await fixture(t); await f.release(f.state.version);
  const response = await fetch(f.url + '/api/upload', { method: 'POST', body: 'binary-data' });
  assert.equal(await response.text(), '/api/upload:binary-data'); assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.equal(response.headers.get('x-test-forwarded-host'), new URL(f.url).host);
  assert.equal(response.headers.get('x-test-forwarded-proto'), 'http');
  assert.equal(await (await fetch(f.url + '/supervisor/status')).text(), '/status:');
  const events = await fetch(f.url + '/api/events');
  const reader = events.body.getReader(); const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /first/);
  let remaining = ''; while (true) { const chunk = await reader.read(); if (chunk.done) break; remaining += new TextDecoder().decode(chunk.value); }
  assert.match(remaining, /last/);
});

test('forwards WebSocket upgrades and bytes in both directions', async t => {
  const f = await fixture(t);
  const port = f.server.address().port;
  await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1'); let buffer = '', sent = false;
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('upgrade timeout')); });
    socket.on('error', reject);
    socket.on('connect', () => socket.write('GET /api/ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
    socket.on('data', bytes => {
      buffer += bytes;
      if (!sent && buffer.includes('\r\n\r\n')) { assert.match(buffer, /101 Switching Protocols/); sent = true; socket.write('echo-payload'); }
      if (buffer.includes('echo-payload')) { socket.destroy(); resolve(); }
    });
  });
});

test('rejects dev HTML and corrupt candidates without changing the active pointer', async t => {
  const f = await fixture(t); await f.release(f.state.version);
  const stage = join(f.home, 'bad'); await mkdir(stage); await writeFile(join(stage, 'index.html'), '<script src="/src/main.tsx"></script>');
  await assert.rejects(prepareRelease(stage, 'c'.repeat(24)), /Development/);
  assert.equal((await readActive(f.home)).version, f.state.version);
  const path = join(f.home, 'releases', f.state.version);
  await writeFile(join(path, 'assets/main.js'), 'tampered');
  await assert.rejects(verifyRelease(path), /integrity/);
});

test('build snapshots ignore dirty files, skip backend-only changes, and retain old release on failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge snapshot ')); const home = join(root, '.runtime');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  await mkdir(join(root, 'frontend')); await writeFile(join(root, 'frontend/source.txt'), 'committed');
  git('add', 'frontend/source.txt'); git('commit', '-qm', 'fixture');
  await writeFile(join(root, 'frontend/source.txt'), 'uncommitted');
  const build = async ({ frontend, output, source }) => {
    assert.equal(await readFile(join(frontend, 'source.txt'), 'utf8'), 'committed');
    await mkdir(join(output, 'assets'), { recursive: true });
    await writeFile(join(output, 'index.html'), `<head><script src="${PREFIX}/releases/${source.version}/assets/main.js"></script></head>`);
    await writeFile(join(output, 'assets/main.js'), 'production');
  };
  const before = await sourceIdentity(root);
  const released = await buildRelease({ root, home }, process.env, { executeBuild: build });
  await writeFile(join(root, 'backend.txt'), 'backend'); git('add', 'backend.txt'); git('commit', '-qm', 'backend only');
  assert.equal((await sourceIdentity(root)).version, before.version);
  assert.equal((await buildRelease({ root, home }, process.env, { executeBuild: () => assert.fail('must reuse') })).version, released.version);
  await writeFile(join(root, 'frontend/source.txt'), 'next'); git('add', 'frontend/source.txt'); git('commit', '-qm', 'next');
  await assert.rejects(buildRelease({ root, home }, process.env, { executeBuild: () => { throw new Error('compiler failed'); } }), /compiler failed/);
  assert.equal((await readActive(join(home, 'frontend'))).version, released.version);
  assert.equal(settingsFrom({}, { frontendMode: 'static' }).frontendMode, 'static');
  assert.throws(() => settingsFrom({}, { frontendMode: 'invalid' }));
});
