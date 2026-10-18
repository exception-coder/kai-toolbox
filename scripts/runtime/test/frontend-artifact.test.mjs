import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { readActive, verifyRelease, PREFIX } from '../frontend/releases.mjs';
import { createFrontendServer, frontendTls } from '../frontend/server.mjs';

test('real production artifact serves over verified TLS and remains stable for sixty seconds', {
  skip: !process.env.FORGE_FRONTEND_TEST_HOME, timeout: 120_000,
}, async t => {
  const home = process.env.FORGE_FRONTEND_TEST_HOME;
  const active = await readActive(home); assert.ok(active);
  await verifyRelease(join(home, 'releases', active.version));
  const ca = await readFile(process.env.FORGE_FRONTEND_TEST_CA || join(homedir(), '.vite-plugin-mkcert/rootCA.pem'));
  const server = createFrontendServer({ home, tls: await frontendTls(process.env),
    state: () => ({ ready: true, version: active.version, buildState: 'ready' }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const get = path => new Promise((resolve, reject) => {
    const request = https.get({ hostname: '127.0.0.1', servername: 'localhost', port, path, ca,
      headers: { 'Accept-Encoding': 'identity' } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
      response.on('error', reject);
    });
    request.setTimeout(5000, () => request.destroy(new Error('artifact request timeout'))); request.on('error', reject);
  });
  const html = await get('/'); assert.equal(html.status, 200);
  assert.ok(html.body.includes(active.version));
  const scripts = [...html.body.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
  assert.ok(!scripts.some(path => path === '/@vite/client' || path.startsWith('/src/')));
  for (const path of scripts.filter(path => path.startsWith(PREFIX))) {
    const script = await get(path); assert.equal(script.status, 200); assert.match(script.headers['content-type'], /javascript/);
    assert.match(script.headers['cache-control'], /immutable/);
  }
  assert.equal((await get('/tools/fore-consult')).status, 200);
  assert.equal((await get('/src/main.tsx')).status, 404);
  const started = Date.now();
  do {
    const response = await get(`${PREFIX}/status`);
    assert.equal(response.status, 200); assert.equal(JSON.parse(response.body).version, active.version);
    assert.equal(server.address().port, port); assert.equal(server.listening, true);
    await delay(15_000);
  } while (Date.now() - started < 60_000);
  assert.equal((await get('/')).status, 200);
  console.log(`Verified TLS production release ${active.version}; stableMs=${Date.now() - started}; port=${port}`);
});
