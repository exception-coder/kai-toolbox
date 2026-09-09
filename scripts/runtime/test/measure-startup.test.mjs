import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { measureStartup, measurementOptions } from '../measure-startup.mjs';
import { measurementProcess } from '../measurement-process.mjs';
import { createServer as httpServer } from 'node:http';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'forge measurement '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const jar = join(root, 'app.jar'); writeFileSync(jar, 'fixture');
  mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'boot'));
  const mvn = join(root, 'bin', process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
  writeFileSync(mvn, ''); writeFileSync(join(root, 'boot/plexus-classworlds-fixture.jar'), '');
  return { root, env: { ...process.env, JAVA_CMD: process.execPath, MVN_CMD: mvn },
    options: { port: 0, timeoutSeconds: 0.3, skipBuild: true, targetPath: '', applicationJar: jar } };
}

function runtimeLauncher(behavior, state) {
  return (command, args, options) => {
    const get = name => args.find(arg => arg.startsWith(`-Dtoolbox.performance.${name}=`)).split('=').slice(1).join('=');
    const file = get('report-path'); const id = get('run-id');
    const code = behavior === 'exit' ? 'process.exit(19)' : behavior === 'timeout' ? 'setInterval(()=>{},1000)' :
      `require('fs').writeFileSync(${JSON.stringify(file)},JSON.stringify({runId:${JSON.stringify(behavior === 'mismatch' ? 'wrong' : id)},milestones:{applicationReady:{status:'COMPLETED'}}}));setInterval(()=>{},1000)`;
    const child = measurementProcess({ file: process.execPath, args: ['-e', code] }, [], options);
    state.child = child; state.args = args;
    return child;
  };
}

test('option parsing rejects invalid values without echoing secrets', () => {
  assert.equal(measurementOptions(['--skip-build', '--port', '19090']).port, 19090);
  assert.throws(() => measurementOptions(['--port', '0']), /Port/);
  assert.throws(() => measurementOptions(['--timeout-seconds', 'abc']), /Timeout/);
  assert.throws(() => measurementOptions(['--unknown-secret']), /Invalid measurement option/);
});

test('ready report is correlated and owned process is stopped', async t => {
  const f = fixture(t); const state = {};
  f.options.timeoutSeconds = 5;
  const result = await measureStartup(f.root, f.options, f.env, { launch: runtimeLauncher('ready', state) });
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.runtime.runId, result.report.runId);
  assert.equal(result.report.build.status, 'NOT_MEASURED');
  assert.ok(state.child.result);
  assert.ok(state.args.some(arg => arg.startsWith('--toolbox.sqlite.file=') && arg.includes(result.report.runId)));
  assert.equal(JSON.parse(readFileSync(result.reportPath)).status, 'COMPLETED');
});

for (const behavior of ['exit', 'timeout', 'mismatch']) {
  test(`${behavior} retains failure and cleans up owned process`, async t => {
    const f = fixture(t); const state = {};
    if (behavior !== 'timeout') f.options.timeoutSeconds = 5;
    const { report } = await measureStartup(f.root, f.options, f.env, { launch: runtimeLauncher(behavior, state) });
    assert.equal(report.status, 'FAILED'); assert.ok(state.child.result);
    if (behavior === 'exit') assert.equal(report.launch.exitCode, 19);
    if (behavior === 'timeout') assert.equal(report.launch.status, 'TIMED_OUT');
    if (behavior === 'mismatch') assert.equal(report.runtime, null);
  });
}

test('build failure preserves exit code and prevents application launch', async t => {
  const f = fixture(t); f.options.skipBuild = false;
  let calls = 0;
  const { report } = await measureStartup(f.root, f.options, f.env, { launch: (command, args, options) => {
    calls++;
    return measurementProcess({ file: process.execPath, args: ['-e', 'process.exit(17)'] }, [], options);
  } });
  assert.equal(calls, 1); assert.equal(report.build.exitCode, 17);
  assert.equal(report.build.status, 'FAILED'); assert.equal(report.launch.status, 'NOT_MEASURED');
});

test('occupied port and invalid target do not start or stop another process', async t => {
  const f = fixture(t); const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    f.options.port = server.address().port;
    const dependencies = { launch: () => { throw new Error('Must not launch'); } };
    const busy = await measureStartup(f.root, f.options, f.env, dependencies);
    assert.match(busy.report.error, /occupied/); assert.ok(server.listening);
    f.options.targetPath = '/api/tools?secret=hidden';
    const invalid = await measureStartup(f.root, f.options, f.env, dependencies);
    assert.ok(!readFileSync(invalid.reportPath, 'utf8').includes('hidden'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('interrupt during build retains failure and reaps the owned child', async t => {
  const f = fixture(t); f.options.skipBuild = false;
  let child;
  const result = await measureStartup(f.root, f.options, f.env, { launch: (command, args, options) => {
    child = measurementProcess({ file: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] }, [], options);
    setTimeout(() => process.emit('SIGINT'), 100);
    return child;
  } });
  assert.equal(result.exitCode, 1); assert.equal(result.report.build.status, 'FAILED');
  assert.ok(child.result); assert.match(result.report.error, /interrupted/);
});

test('optional target measures HTTP status without following redirects', async t => {
  for (const status of [200, 302]) {
    const f = fixture(t); f.options.timeoutSeconds = 5;
    const state = {}; const server = httpServer((request, response) => {
      response.writeHead(status, { Location: 'http://example.invalid/' }); response.end('fixture');
    });
    // Start the target only after the measurement's occupied-port check.
    const launch = runtimeLauncher('ready', state);
    f.options.targetPath = '/api/tools';
    try {
      const result = await measureStartup(f.root, f.options, f.env, { launch: (...args) => {
        server.listen(0, '127.0.0.1', () => { f.options.port = server.address().port; });
        return launch(...args);
      } });
      assert.equal(result.report.targetRequest.statusCode, status);
      assert.equal(result.exitCode, status === 200 ? 0 : 1);
      assert.ok(state.child.result);
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
});
