import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackend } from '../source-backend.mjs';
import { serviceEnvironment } from '../service-environment.mjs';

test('source launch preserves performance attribution and stops after build failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'forge backend '));
  mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'boot'));
  const mvn = join(root, 'bin', process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
  writeFileSync(mvn, ''); writeFileSync(join(root, 'boot/plexus-classworlds-test.jar'), '');
  const env = { MVN_CMD: mvn, JAVA_CMD: process.execPath };
  const calls = [];
  await runBackend(root, { mode: 'dev' }, env, async (command, args) => { calls.push({ command, args }); });
  assert.ok(calls[0].args.includes('-am') && calls[0].args.includes('install'));
  assert.ok(!calls[1].args.includes('-am'));
  assert.match(calls[1].args.at(-1), /build-scope=maven-before-jvm/);
  assert.ok(!calls[1].args.at(-1).includes('build-duration-ms'));
  calls.length = 0;
  await runBackend(root, { mode: 'full' }, env, async (command, args) => { calls.push({ command, args }); });
  assert.ok(calls[1].command.args.some(arg => arg.startsWith('-Dtoolbox.performance.build-duration-ms=')));
  assert.equal(calls[1].args[1], join(root, 'toolbox-starter/target/kai-toolbox.jar'));
  let attempts = 0;
  await assert.rejects(runBackend(root, { mode: 'full' }, env, async () => { attempts++; throw new Error('build failed'); }), /build failed/);
  assert.equal(attempts, 1);
});

test('configuration preserves secrets in environment and platform CPU defaults', () => {
  const env = serviceEnvironment('/repo', { port: 18081 }, { TOOLBOX_QDRANT_API_KEY: 'secret', ARIA2_BIN: '/tool/aria2' }, 'darwin');
  assert.equal(env.WHISPER_DEVICE, 'cpu');
  assert.equal(env.TOOLBOX_ARIA2_BINARY, '/tool/aria2');
  assert.equal(JSON.parse(env.SPRING_APPLICATION_JSON)['toolbox.ai-secretary.rag.qdrant-api-key'], 'secret');
});
