import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitForStartup, startupTimeout } from '../startup-progress.mjs';

const paths = { root: '/fixture', logs: '/fixture/logs' };
const snapshot = { implementation: 'forge-node-pm2', repoRoot: paths.root, bootstrapAttached: true,
  servicesReady: true, frontendEnabled: true, frontendReady: true,
  services: [{ name: 'frontend', ready: true, state: 'online' }] };

test('success waits for HTTP and distinguishes optional failure', async () => {
  const lines = [];
  let probes = 0;
  await waitForStartup(paths, { port: 18081 }, { FORGE_START_TIMEOUT_SECONDS: '2' }, {
    readStatus: async () => ({ ...snapshot, services: [...snapshot.services, { name: 'studio', state: 'errored', ready: false }] }),
    probe: async () => ++probes === 1 ? {} : { frontend: 'https://localhost:5173' },
    emit: line => lines.push(line), pollMs: 5,
  });
  assert.equal(probes, 2);
  assert.match(lines.join('\n'), /等待 HTTP 响应/);
  assert.match(lines.join('\n'), /工作台：https:\/\/localhost:5173/);
  assert.match(lines.join('\n'), /AgentScope Studio：启动失败/);
});

test('core failure and timeout never report success', async () => {
  const lines = [];
  await assert.rejects(waitForStartup(paths, { port: 18081 }, {}, {
    readStatus: async () => ({ ...snapshot, services: [{ name: 'frontend', state: 'errored' }] }),
    emit: line => lines.push(line),
  }), /前端启动失败/);
  await assert.rejects(waitForStartup(paths, { port: 18081 }, { FORGE_START_TIMEOUT_SECONDS: '1' }, {
    readStatus: async () => { throw new Error('not listening'); }, emit: line => lines.push(line), pollMs: 20,
  }), /启动等待超时/);
  assert.ok(!lines.join('\n').includes('启动成功'));
  assert.throws(() => startupTimeout({ FORGE_START_TIMEOUT_SECONDS: 'no' }));
});

test('managed tunnel waits for public origin and reports tunnel startup failure', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'forge-tunnel-startup-'));
  try {
    const credential = join(temp, 'credential.json');
    const config = join(temp, 'config.yml');
    writeFileSync(credential, '{}');
    writeFileSync(config, `tunnel: example\ncredentials-file: ${credential.replaceAll('\\', '/')}\ningress:\n  - hostname: example.com\n    service: http://localhost:18080\n  - service: http_status:404\n`);
    const env = { FORGE_START_TIMEOUT_SECONDS: '1', FORGE_CLOUDFLARE_ENABLED: 'true', FORGE_CLOUDFLARE_CONFIG: config };
    const tunnel = { enabled: true, state: 'online' };
    const lines = [];
    let publicProbes = 0;
    await waitForStartup(paths, { port: 18081 }, env, {
      readStatus: async () => ({ ...snapshot, tunnel }),
      probe: async () => ({ frontend: 'https://localhost:5173' }),
      probeTunnel: async hostname => {
        assert.equal(hostname, 'example.com');
        return ++publicProbes === 1 ? { state: 'failed' } : { state: 'ready' };
      },
      emit: line => lines.push(line), pollMs: 5, tunnelProbeIntervalMs: 1,
    });
    assert.equal(publicProbes, 2);
    assert.match(lines.join('\n'), /等待公网回源/);
    assert.match(lines.join('\n'), /公网已就绪/);
    await assert.rejects(waitForStartup(paths, { port: 18081 }, env, {
      readStatus: async () => ({ ...snapshot, tunnel: { enabled: true, state: 'not_started' }, lastError: 'missing config' }),
      probe: async () => ({ frontend: 'https://localhost:5173' }),
      emit: () => {},
    }), /Cloudflare 隧道启动失败.*missing config/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
