import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function fixture(root, port, token) {
  mkdirSync(join(root, 'frontend'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'scripts/run-tools.conf'), `FORGE_FRONTEND_PORT=${port}\nTOOLBOX_SUPERVISOR_RESTART_TOKEN=${token}\n`);
  writeFileSync(join(root, 'frontend/package.json'), JSON.stringify({ name: 'forge-fixture', version: '1.0.0', scripts: { dev: 'node server.mjs' } }));
  writeFileSync(join(root, 'frontend/package-lock.json'), JSON.stringify({ name: 'forge-fixture', version: '1.0.0', lockfileVersion: 3,
    packages: { '': { name: 'forge-fixture', version: '1.0.0' } } }));
  writeFileSync(join(root, 'frontend/version.txt'), 'one');
  writeFileSync(join(root, 'frontend/server.mjs'), `import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const value = readFileSync(new URL('./version.txt', import.meta.url), 'utf8');
createServer((q,s)=>s.end(value)).listen(Number(process.env.FORGE_FRONTEND_PORT), '127.0.0.1');`);
}

function invoke(root, home, args) {
  return new Promise((resolve, reject) => {
    const script = `import {main} from ${JSON.stringify(new URL('../cli.mjs', import.meta.url).href)}; await main(process.argv[1],process.argv.slice(2));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, root, ...args], {
      env: { ...process.env, FORGE_RUNTIME_HOME: home }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => resolve({ code, output }));
  });
}

async function waitFor(check) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch { /* Restart temporarily closes sockets. */ }
    await delay(300);
  }
  throw new Error('Timed out waiting for fixture');
}

test('real PM2 isolation, source reload, crash recovery and owned-tree stop', { timeout: 150000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'forge runtime 中文 '));
  const a = join(directory, 'workspace a'), b = join(directory, 'workspace b');
  const homeA = join(directory, 'home a'), homeB = join(directory, 'home b');
  const [portA, portB, controlA, controlB] = await Promise.all([freePort(), freePort(), freePort(), freePort()]);
  fixture(a, portA, 'secret-a'); fixture(b, portB, 'secret-b');
  t.after(async () => { await invoke(a, homeA, ['stop']); await invoke(b, homeB, ['stop']); });
  const idleStop = await invoke(a, homeA, ['stop', '--scope', 'frontend']);
  assert.equal(idleStop.code, 0, idleStop.output);
  assert.ok(!idleStop.output.includes('Forge stopped'));
  const startedA = await invoke(a, homeA, ['start', '--scope', 'frontend', '--port', String(controlA)]);
  assert.equal(startedA.code, 0, startedA.output);
  assert.match(startedA.output, /主服务启动成功/);
  const startedB = await invoke(b, homeB, ['start', '--scope', 'frontend', '--port', String(controlB)]);
  assert.equal(startedB.code, 0, startedB.output);
  const getStatus = port => fetch(`http://127.0.0.1:${port}/status`).then(response => response.json());
  const statusA = await waitFor(async () => { const status = await getStatus(controlA); return status.servicesReady && status; });
  const statusB = await waitFor(async () => { const status = await getStatus(controlB); return status.servicesReady && status; });
  const cliStatus = await invoke(a, homeA, ['status']);
  assert.equal(cliStatus.code, 0, cliStatus.output);
  assert.match(cliStatus.output, /"servicesReady": true/);
  assert.ok(!cliStatus.output.includes('secret-a'));
  assert.notEqual((await invoke(a, homeA, ['stop', '--scope', 'invalid'])).code, 0);
  assert.notEqual(statusA.bootstrapPid, statusB.bootstrapPid);
  assert.ok(!JSON.stringify(statusA).includes('secret-a'));
  assert.equal((await fetch(`http://127.0.0.1:${controlA}/full-reload`, { method: 'POST' })).status, 403);
  writeFileSync(join(a, 'frontend/version.txt'), 'two');
  assert.equal((await fetch(`http://127.0.0.1:${controlA}/full-reload`, { method: 'POST', headers: { 'X-Restart-Token': 'secret-a' } })).status, 202);
  await waitFor(async () => (await (await fetch(`http://127.0.0.1:${portA}`)).text()) === 'two');
  const reloaded = await getStatus(controlA);
  assert.notEqual(reloaded.controllerPid, statusA.controllerPid);
  assert.equal((await getStatus(controlB)).controllerPid, statusB.controllerPid);
  const cliReload = await invoke(a, homeA, ['restart']);
  assert.equal(cliReload.code, 0, cliReload.output);
  const afterCliReload = await waitFor(async () => { const status = await getStatus(controlA);
    return status.servicesReady && status.controllerPid !== reloaded.controllerPid && status; });
  process.kill(afterCliReload.controllerPid, 'SIGKILL');
  await waitFor(async () => { const status = await getStatus(controlA); return status.servicesReady && status.controllerPid !== afterCliReload.controllerPid; });
  const duplicate = await invoke(a, homeA, ['start']);
  assert.equal(duplicate.code, 0);
  assert.match(duplicate.output, /主服务启动成功/);
  assert.equal((await invoke(a, homeA, ['stop'])).code, 0);
  await assert.rejects(fetch(`http://127.0.0.1:${portA}`));
  assert.equal((await (await fetch(`http://127.0.0.1:${portB}`)).text()), 'one');
  // An occupied unmanaged port is rejected, not killed.
  writeFileSync(join(a, 'scripts/run-tools.conf'), `FORGE_FRONTEND_PORT=${portB}\n`);
  const conflict = await invoke(a, homeA, ['start', '--scope', 'frontend', '--port', String(controlA)]);
  assert.notEqual(conflict.code, 0);
  const unmanagedStatus = await invoke(a, homeA, ['status']);
  assert.notEqual(unmanagedStatus.code, 0);
  assert.match(unmanagedStatus.output, /不受新守护器管理/);
  const unmanagedStop = await invoke(a, homeA, ['stop', '--scope', 'frontend']);
  assert.notEqual(unmanagedStop.code, 0);
  assert.ok(!unmanagedStop.output.includes('Forge stopped'));
  assert.match(unmanagedStop.output, /不受新守护器管理/);
  assert.equal((await (await fetch(`http://127.0.0.1:${portB}`)).text()), 'one');
  console.log(`PM2 fixture logs retained for diagnosis: ${directory}`);
});
