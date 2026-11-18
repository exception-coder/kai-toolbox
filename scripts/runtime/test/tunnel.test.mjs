import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tunnelAsset, tunnelArguments, quickArguments, probeNamedTunnel,
  activeTunnelApp, managedTunnelConfig, ensureManagedTunnel, tunnelReplicas, tunnelSnapshot } from '../tunnel.mjs';

test('cloudflared assets match supported OS and architecture', () => {
  assert.equal(tunnelAsset('win32', 'x64'), 'cloudflared-windows-amd64.exe');
  assert.equal(tunnelAsset('linux', 'arm64'), 'cloudflared-linux-arm64');
  assert.equal(tunnelAsset('darwin', 'arm64'), 'cloudflared-darwin-arm64.tgz');
  assert.throws(() => tunnelAsset('linux', 'ia32'), /Unsupported/);
  assert.throws(() => tunnelAsset('freebsd', 'x64'), /Unsupported/);
});

test('quick tunnel permits local self-signed HTTPS without weakening remote origins', () => {
  assert.ok(quickArguments('quick.yml', 'https://localhost:5173', 'http2').includes('--no-tls-verify'));
  assert.ok(!quickArguments('quick.yml', 'https://example.com', 'http2').includes('--no-tls-verify'));
  assert.ok(!quickArguments('quick.yml', 'http://localhost:5173', 'http2').includes('--no-tls-verify'));
  assert.throws(() => quickArguments('quick.yml', 'file:///secret', 'http2'), /HTTP/);
});

test('named tunnel uses existing config as one argument and rejects unknown protocol', () => {
  assert.deepEqual(tunnelArguments('C:/user space/config.yml'),
    ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--config', 'C:/user space/config.yml', 'run']);
  assert.throws(() => tunnelArguments('config.yml', 'invalid'), /Invalid/);
});

test('named tunnel check requires both public page and API to reach an origin', async () => {
  const request = async () => ({ status: 200, body: null });
  const ready = await probeNamedTunnel('example.com', request);
  assert.equal(ready.state, 'ready');
  assert.deepEqual(ready.checks.map(check => check.route), ['/', '/api/tools']);
  const badGateway = await probeNamedTunnel('example.com', async url => ({
    status: url.endsWith('/api/tools') ? 502 : 200, body: null,
  }));
  assert.equal(badGateway.state, 'failed');
  assert.equal((await probeNamedTunnel('example.com', async url => ({
    status: url.endsWith('/api/tools') ? 403 : 200, body: null,
  }))).state, 'failed');
  const unreachable = await probeNamedTunnel('example.com', async () => { throw new Error('network unavailable'); });
  assert.equal(unreachable.state, 'failed');
  assert.equal((await probeNamedTunnel(null, request)).state, 'unverified');
});

test('configured project starts one managed tunnel with bounded PM2 crash recovery', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-managed-tunnel-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const credential = join(directory, 'credential.json');
  const config = join(directory, 'config.yml');
  writeFileSync(credential, '{}');
  writeFileSync(config, `credentials-file: ${credential}\ningress:\n  - hostname: forge.example.com\n    service: http://localhost:18080\n`);
  const env = { FORGE_CLOUDFLARE_ENABLED: 'true', FORGE_CLOUDFLARE_CONFIG: config };
  assert.equal(managedTunnelConfig({ FORGE_CLOUDFLARE_ENABLED: 'false' }), null);
  const apps = [];
  const manager = { call: async (method, value) => {
    if (method === 'list') return apps;
    assert.equal(method, 'start');
    apps.push({ name: 'cloudflare', pid: 42, pm2_env: { status: 'online' } });
    assert.equal(value.autorestart, true);
    assert.equal(value.max_restarts, 5);
    assert.ok(value.args.includes(config));
  } };
  const paths = { root: directory, logs: directory };
  assert.equal((await ensureManagedTunnel(manager, paths, env, async () => join(directory, 'cloudflared'))).enabled, true);
  assert.equal((await ensureManagedTunnel(manager, paths, env, async () => { throw new Error('duplicate start'); })).pid, 42);
  assert.equal(apps.length, 1);
  assert.equal((await ensureManagedTunnel(manager, paths, {}, async () => { throw new Error('disabled'); })).enabled, false);
});

test('replicas use one named tunnel and independent source bindings', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-tunnel-replicas-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const credential = join(directory, 'credential.json');
  const config = join(directory, 'config.yml');
  writeFileSync(credential, '{}');
  writeFileSync(config, `credentials-file: ${credential}\ningress:\n  - hostname: forge.example.com\n`);
  const primary = { address: '192.0.2.10' };
  const replica = { address: '198.51.100.20' };
  const interfaces = { wifi: [primary], ethernet: [replica] };
  const env = { FORGE_CLOUDFLARE_ENABLED: 'true', FORGE_CLOUDFLARE_CONFIG: config,
    FORGE_CLOUDFLARE_PROTOCOL: 'quic', FORGE_CLOUDFLARE_EDGE_BIND_ADDRESS: primary.address,
    FORGE_CLOUDFLARE_REPLICA_BIND_ADDRESS: replica.address };
  assert.throws(() => managedTunnelConfig(env, { wifi: [primary, replica] }), /distinct local network interfaces/);
  assert.throws(() => managedTunnelConfig({ ...env, FORGE_CLOUDFLARE_EDGE_BIND_ADDRESS: '' }, interfaces), /explicit bind/);
  assert.throws(() => tunnelArguments(config, 'http2', 'invalid'), /must be an IP/);

  const paths = { root: directory, logs: directory };
  const apps = [];
  const manager = { call: async (method, value) => {
    if (method === 'list') return apps;
    assert.equal(method, 'start');
    assert.equal(value.autorestart, true);
    apps.push({ name: value.name, pid: apps.length + 1, pm2_env: { status: 'online', args: value.args } });
  } };
  const start = (available = interfaces) => ensureManagedTunnel(manager, paths, env, async () => 'cloudflared', available);
  await assert.rejects(start({ ethernet: [replica] }), /cloudflare: the configured bind address is not assigned/);
  assert.equal(activeTunnelApp(apps).name, 'cloudflare-replica');
  await start();
  await start();
  const connectors = tunnelReplicas([...apps, { name: 'backend' }]);
  assert.equal(connectors.length, 2);
  const primaryApp = activeTunnelApp(apps);
  assert.equal(primaryApp.name, 'cloudflare');
  assert.deepEqual(primaryApp.pm2_env.args, tunnelArguments(config, 'quic', primary.address));
  assert.deepEqual(apps[0].pm2_env.args, tunnelArguments(config, 'http2', replica.address));
  primaryApp.pm2_env.status = 'stopped';
  const snapshot = tunnelSnapshot(apps, true);
  assert.equal(snapshot.name, 'cloudflare-replica');
  assert.equal(snapshot.state, 'online');
  assert.deepEqual(snapshot.connectors.map(connector => connector.state), ['stopped', 'online']);
  primaryApp.pm2_env.args = tunnelArguments(config, 'quic');
  await assert.rejects(start(), /cloudflare is configured differently/);
  assert.equal(apps.length, 2);
});
