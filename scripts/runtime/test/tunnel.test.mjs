import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tunnelAsset, tunnelArguments, quickArguments } from '../tunnel.mjs';

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
