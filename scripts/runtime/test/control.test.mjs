import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlServer } from '../control.mjs';
import { readConfig, settingsFrom } from '../config.mjs';
import { serviceCatalog } from '../services.mjs';

test('restart authorization, capability check and serialized mutations', async t => {
  let changes = 0, attached = true;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const server = controlServer({ internalToken: 'internal', externalToken: 'external',
    status: async () => ({ bootstrapAttached: attached, backendEnabled: true }),
    mutate: async () => { changes++; await pending; }, onError: error => { throw error; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { release(); server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, token) => fetch(url + path, { method: 'POST', headers: { 'X-Restart-Token': token } });
  assert.equal((await post('/restart', 'internal')).status, 403);
  attached = false;
  assert.equal((await post('/full-reload', 'internal')).status, 409);
  attached = true;
  assert.equal((await post('/full-reload', 'internal')).status, 202);
  assert.equal((await post('/restart', 'external')).status, 409);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(changes, 1);
  const body = await (await fetch(url + '/status')).text();
  assert.ok(!body.includes('internal') && !body.includes('external'));
});

test('scope and desktop platform constraints are explicit', () => {
  assert.throws(() => settingsFrom({}, { scope: 'anything' }));
  assert.throws(() => serviceCatalog({ FORGE_WECHAT_ENABLED: 'true' }, 'linux'), /Windows/);
  assert.equal(serviceCatalog({}, 'darwin').find(item => item.name === 'faster-whisper').enabled, true);
  assert.equal(readConfig('.', { EXAMPLE_KEY: 'inherited' }).EXAMPLE_KEY, 'inherited');
});
