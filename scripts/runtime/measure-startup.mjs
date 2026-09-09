import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { executable, mavenCommand } from './commands.mjs';
import { measurementProcess } from './measurement-process.mjs';

export function measurementOptions(args) {
  const result = { port: 18090, timeoutSeconds: 120, skipBuild: false, targetPath: '' };
  const keys = { '--port': 'port', '--timeout-seconds': 'timeoutSeconds', '--target-path': 'targetPath',
    '--application-jar': 'applicationJar', '--output-root': 'outputRoot' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skip-build') result.skipBuild = true;
    else if (keys[args[i]] && args[i + 1] && !args[i + 1].startsWith('--')) result[keys[args[i]]] = args[++i];
    else throw new Error('Invalid measurement option; use node forge.mjs help');
  }
  result.port = Number(result.port);
  result.timeoutSeconds = Number(result.timeoutSeconds);
  if (!Number.isInteger(result.port) || result.port < 1024 || result.port > 65535) throw new Error('Port must be 1024–65535');
  if (!Number.isInteger(result.timeoutSeconds) || result.timeoutSeconds < 5 || result.timeoutSeconds > 600) throw new Error('Timeout must be 5–600 seconds');
  return result;
}

async function assertFreePort(port) {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', () => reject(new Error('Measurement port is occupied or unavailable.')));
    server.listen(port, '127.0.0.1', resolveListen);
  });
  await new Promise(resolveClose => server.close(resolveClose));
}

function runtimeSnapshot(file, runId) {
  if (!existsSync(file)) return null;
  const snapshot = JSON.parse(readFileSync(file, 'utf8'));
  if (snapshot.runId !== runId) throw new Error('Runtime report run ID does not match this measurement.');
  return snapshot;
}

function applicationArguments(options, directory, runId, jar) {
  const data = join(directory, 'data');
  return [`-Dtoolbox.performance.run-id=${runId}`, `-Dtoolbox.performance.report-path=${join(directory, 'runtime.json')}`,
    '-jar', jar, `--server.port=${options.port}`, '--server.address=127.0.0.1',
    `--toolbox.data-dir=${data}`, `--toolbox.sqlite.file=${join(data, 'toolbox.db')}`,
    '--toolbox.magnet.enabled=false', '--toolbox.mail.enabled=false', '--toolbox.ai-secretary.rag.enabled=false',
    '--toolbox.visitor-analysis.rag.enabled=false', '--toolbox.browser-request.sidecar.auto-start=false',
    '--toolbox.auto-update.enabled=false'];
}

async function waitReady(child, context) {
  const { report, options, runtimeFile, signal } = context;
  const start = performance.now();
  report.launch.status = 'RUNNING';
  while (performance.now() - start < options.timeoutSeconds * 1000) {
    signal.throwIfAborted();
    if (child.result) {
      report.launch.status = 'FAILED'; report.launch.exitCode = child.result.code;
      throw new Error('Application exited before readiness; see application.log.');
    }
    report.runtime = runtimeSnapshot(runtimeFile, report.runId);
    if (report.runtime?.milestones?.applicationReady?.status === 'COMPLETED') {
      report.launch.status = 'COMPLETED'; report.launch.durationToReadyMs = performance.now() - start;
      return;
    }
    await delay(100, undefined, { signal });
  }
  report.launch.status = 'TIMED_OUT';
  throw new Error('Application readiness timeout; partial evidence retained.');
}

async function measureTarget(context) {
  const { options, report, signal } = context;
  if (!options.targetPath) return;
  const start = performance.now();
  report.targetRequest.status = 'RUNNING';
  try {
    const response = await fetch(`http://127.0.0.1:${options.port}${options.targetPath}`, {
      redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutSeconds * 1000)]),
    });
    report.targetRequest.statusCode = response.status;
    await response.body?.cancel();
    if (!response.ok) throw new Error('Target did not return 2xx.');
    report.targetRequest.status = 'COMPLETED';
  } catch {
    report.targetRequest.status = 'FAILED';
    throw new Error('Target GET failed; inspect targetRequest status.');
  } finally { report.targetRequest.durationMs = performance.now() - start; }
}

export async function measureStartup(root, options, env, dependencies = {}) {
  const launch = dependencies.launch || measurementProcess;
  const runId = randomUUID();
  const directory = join(resolve(options.outputRoot || join(root, 'outputs/startup-performance')), runId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const report = { schemaVersion: 1, runId, startedAtUtc: new Date().toISOString(), status: 'RUNNING',
    build: { status: 'NOT_MEASURED', scope: 'maven-package', durationMs: null, exitCode: null },
    launch: { status: 'NOT_MEASURED', durationToReadyMs: null, exitCode: null },
    targetRequest: { status: 'NOT_MEASURED', durationMs: null, statusCode: null }, runtime: null, error: null };
  const reportPath = join(directory, 'report.json');
  const save = () => { writeFileSync(reportPath + '.tmp', JSON.stringify(report, null, 2), { mode: 0o600 }); renameSync(reportPath + '.tmp', reportPath); };
  const controller = new AbortController();
  let owned;
  const interrupt = () => controller.abort(new Error('Measurement interrupted.'));
  const stopOnAbort = () => { void owned?.stop(); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  controller.signal.addEventListener('abort', stopOnAbort);
  const context = { options, report, runtimeFile: join(directory, 'runtime.json'), signal: controller.signal };
  try {
    save();
    if (options.targetPath && (!/^\/api\/[a-zA-Z0-9/_{}.-]+$/.test(options.targetPath) || options.targetPath.includes('..'))) throw new Error('Target must be a local read-only /api/ path without query strings.');
    await assertFreePort(options.port);
    if (!options.skipBuild) {
      report.build.status = 'RUNNING'; save();
      const start = performance.now();
      try {
        owned = launch(mavenCommand(root, env), ['-pl', 'toolbox-starter', '-am', '-Dskip.frontend=true', 'package'], { cwd: root, env, log: join(directory, 'build.log') });
        const result = await owned.done;
        report.build.exitCode = result.code;
        controller.signal.throwIfAborted();
        if (result.code !== 0) throw new Error('Maven package failed; see build.log.');
        report.build.status = 'COMPLETED';
      } finally {
        report.build.durationMs = performance.now() - start;
        if (report.build.status === 'RUNNING') report.build.status = 'FAILED';
        save();
      }
    }
    controller.signal.throwIfAborted();
    const jar = resolve(options.applicationJar || join(root, 'toolbox-starter/target/kai-toolbox.jar'));
    if (!existsSync(jar)) throw new Error('Application jar missing; run without --skip-build first.');
    owned = launch({ file: executable('java', env.JAVA_CMD || env.JAVA_HOME, env), args: [] }, applicationArguments(options, directory, runId, jar), { cwd: root, env, log: join(directory, 'application.log') });
    await waitReady(owned, context);
    await measureTarget(context);
    report.status = 'COMPLETED';
  } catch (error) {
    report.status = 'FAILED'; report.error = error.message;
    if (report.launch.status === 'RUNNING') report.launch.status = 'FAILED';
  } finally {
    try { await owned?.stop(); report.runtime = runtimeSnapshot(context.runtimeFile, runId); }
    catch { report.status = 'FAILED'; report.error ||= 'Cleanup or final runtime report failed.'; }
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    controller.signal.removeEventListener('abort', stopOnAbort);
    save();
  }
  console.log(reportPath);
  return { report, reportPath, exitCode: report.status === 'COMPLETED' ? 0 : 1 };
}
