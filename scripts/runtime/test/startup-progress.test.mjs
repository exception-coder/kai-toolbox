import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForStartup, startupTimeout } from '../startup-progress.mjs';

const paths = { root: '/fixture', logs: '/fixture/logs' };
const snapshot = { implementation: 'forge-node-pm2', repoRoot: paths.root, bootstrapAttached: true,
  servicesReady: true, frontendEnabled: true, frontendReady: true,
  services: [{ name: 'frontend', ready: true, state: 'online' }] };

test('success waits for HTTP and distinguishes optional failure', async () => {
  const lines = [];
  let probes = 0;
  await waitForStartup(paths, { port: 18081 }, { FORGE_START_TIMEOUT_SECONDS: '2' }, {
    readStatus: async () => ({ ...snapshot, services: [...snapshot.services, { name: 'wechat', state: 'errored', ready: false }] }),
    probe: async () => ++probes === 1 ? {} : { frontend: 'https://localhost:5173' },
    emit: line => lines.push(line), pollMs: 5,
  });
  assert.equal(probes, 2);
  assert.match(lines.join('\n'), /等待 HTTP 响应/);
  assert.match(lines.join('\n'), /工作台：https:\/\/localhost:5173/);
  assert.match(lines.join('\n'), /微信服务：启动失败/);
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
