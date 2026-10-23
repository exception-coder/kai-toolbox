import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOwnedOrphan, prepareSidecarPort, prepareSidecarRuntime, portListening, sidecarPort } from '../sidecar-startup.mjs';

const entry = resolve('/workspace with spaces/sidecar/claude-agent/dist/server.js');
const orphan = { pid: 42, executable: process.execPath, commandLine: `"${process.execPath}" "${entry}"`, parentAlive: false, createdAt: 'one' };

test('only an exact workspace Node entry with a dead parent can be recovered', () => {
  assert.equal(isOwnedOrphan(orphan, entry), true);
  for (const patch of [
    { parentAlive: true }, { parentAlive: undefined }, { executable: 'java' }, { pid: 1 },
    { commandLine: 'node dist/server.js' }, { commandLine: `node other.js "${entry}"` },
    { commandLine: `node "${entry}.other"` }, { commandLine: 'node /other/sidecar/claude-agent/dist/server.js' },
  ]) assert.equal(isOwnedOrphan({ ...orphan, ...patch }, entry), false);
  assert.throws(() => sidecarPort({ CLAUDE_CHAT_SIDECAR_PORT: '18890;bad' }));
});

test('normal release and confirmed orphan recovery complete before build', async () => {
  let occupied = true, clock = 0, inspections = 0, terminated = 0;
  const result = await prepareSidecarPort(entry, 18890, {
    probe: async () => occupied, inspect: async () => { inspections++; return orphan; },
    now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 500,
    terminate: async pid => { assert.equal(pid, 42); terminated++; occupied = false; },
  });
  assert.equal(result, null); assert.equal(terminated, 1); assert.equal(inspections, 2);
  assert.equal(await prepareSidecarPort(entry, 18890, { probe: async () => false }), null);
});

test('identity changes, live parents and ambiguous legacy processes are not terminated', async () => {
  for (const current of [{ ...orphan, createdAt: 'two' }, { ...orphan, parentAlive: true }, null,
    { ...orphan, commandLine: 'node dist/server.js' }]) {
    let calls = 0;
    const result = await prepareSidecarPort(entry, 18890, {
      timeoutMs: 0, probe: async () => true, inspect: async () => ++calls === 1 ? orphan : current,
      terminate: () => assert.fail('must not terminate another owner'),
    });
    assert.match(result, /Forge 后端继续启动/);
  }
});

test('blocked Sidecar does not mutate live dependencies/build or abort backend preparation', async () => {
  const server = createServer(socket => socket.end());
  await new Promise(yes => server.listen(0, '127.0.0.1', yes));
  try {
    const port = server.address().port;
    assert.equal(await portListening(port), true);
    const env = { CLAUDE_CHAT_SIDECAR_PORT: String(port), SPRING_APPLICATION_JSON: '{"existing":"keep"}' };
    await prepareSidecarRuntime('/workspace', env, {
      checkPort: (file, value) => prepareSidecarPort(file, value, { timeoutMs: 0, inspect: async () => null }),
      prepare: () => assert.fail('live dependencies must be preserved'), build: () => assert.fail('live dist must be preserved'),
    });
    const config = JSON.parse(env.SPRING_APPLICATION_JSON);
    assert.equal(config.existing, 'keep');
    assert.match(config['toolbox.claude-chat.sidecar-startup-error'], /未构建或启动 AI/);
    assert.equal(await portListening(port), true);
  } finally { await new Promise(yes => server.close(yes)); }
});

test('build port race becomes an explicit AI block while unrelated compiler failures still fail', async () => {
  const failure = new Error('compiler or promotion failed');
  const options = { checkPort: async () => null, prepare: async () => {}, build: async () => { throw failure; } };
  await assert.rejects(prepareSidecarRuntime('/workspace', {}, { ...options, probe: async () => false }), failure);
  const env = {};
  await prepareSidecarRuntime('/workspace', env, { ...options, probe: async () => true });
  assert.match(JSON.parse(env.SPRING_APPLICATION_JSON)['toolbox.claude-chat.sidecar-startup-error'], /构建未成功/);
});

test('OS inventory recovers an actual isolated orphan listener, not a managed Forge port', { timeout: 45000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-sidecar-orphan 中文 '));
  const fixture = join(directory, 'server.mjs');
  writeFileSync(fixture, `import {createServer} from 'node:net';
    const server=createServer(socket=>socket.end());
    server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,pid:process.pid})));
    setTimeout(()=>process.exit(2),40000).unref();`);
  const parentCode = `import {spawn} from 'node:child_process';
    spawn(process.execPath,[${JSON.stringify(fixture)}],{stdio:['ignore','inherit','inherit'],detached:true,windowsHide:true});
    setTimeout(()=>process.exit(0),400);`;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', parentCode], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(yes => parent.once('exit', yes));
  const child = await new Promise((yes, no) => {
    let buffer = '';
    parent.once('error', no);
    parent.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.includes('\n')) { try { yes(JSON.parse(buffer.split('\n')[0])); } catch (error) { no(error); } }
    });
  });
  await exited;
  assert.equal(await portListening(child.port), true, 'fixture must remain listening after its parent exits');
  let terminated = 0;
  const result = await prepareSidecarPort(fixture, child.port, { timeoutMs: 0, terminate: pid => {
    assert.equal(pid, child.pid);
    terminated++;
    process.kill(pid, 'SIGTERM');
  } });
  assert.equal(result, null);
  assert.equal(terminated, 1);
  assert.equal(await portListening(child.port), false);
});
