import { existsSync, readFileSync, writeFileSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { runtimePaths, readConfig, settingsFrom } from './config.mjs';
import { connectManager, appOptions, daemonPid } from './process-manager.mjs';
import { portOpen } from './control.mjs';
import { enabledServices, prepareNode, preparePython } from './services.mjs';
import { executable, mavenCommand, npmCommand, run } from './commands.mjs';
import { reportUnmanagedRuntime } from './unmanaged-runtime.mjs';
import { waitForStartup, startupTimeout } from './startup-progress.mjs';

function optionsFrom(args) {
  const options = {};
  const aliases = { '-Mode': 'mode', '--mode': 'mode', '-Scope': 'scope', '--scope': 'scope', '--port': 'port',
    '-Observability': 'observability', '--observability': 'observability' };
  for (let i = 0; i < args.length; i++) {
    if (aliases[args[i]]) {
      const key = aliases[args[i]];
      if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error(`Missing value for ${args[i]}`);
      options[key] = args[++i];
    }
    else if (['-AutoUpdate', '--auto-update'].includes(args[i])) process.env.TOOLBOX_AUTO_UPDATE_ENABLED = 'true';
    else if (['all', 'frontend', 'backend'].includes(args[i])) options.scope = args[i];
    else if (['-HotReload', '--hot-reload'].includes(args[i])) options.hotReload = 'true';
    else throw new Error(`Unknown option ${args[i]}; use node forge.mjs help`);
  }
  return options;
}

async function doctor(paths, env) {
  for (const [command, args] of [[{ file: process.execPath, args: [] }, ['--version']],
    [npmCommand(env), ['--version']], [{ file: executable('java', env.JAVA_CMD || env.JAVA_HOME, env), args: [] }, ['-version']],
    [mavenCommand(paths.root, env), ['--version']], [{ file: executable('git', env.GIT_CMD, env), args: [] }, ['--version']]]) {
    await run(command, args, { cwd: paths.root, env });
  }
}

function recentLog(file) {
  const descriptor = openSync(file, 'r');
  try {
    const size = fstatSync(descriptor).size;
    const buffer = Buffer.alloc(Math.min(size, 65536));
    readSync(descriptor, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
    return buffer.toString('utf8').split(/\r?\n/).slice(-80).join('\n');
  } finally { closeSync(descriptor); }
}

async function prepare(paths, env, settings) {
  await doctor(paths, env);
  for (const service of enabledServices(env, settings)) {
    if (service.python) await preparePython(paths.root, service, env);
    if (service.name === 'frontend') await prepareNode(join(paths.root, 'frontend'), env);
    if (service.name === 'backend') {
      const cwd = join(paths.root, 'sidecar/claude-agent');
      await prepareNode(cwd, env);
      await run(npmCommand(env), ['run', 'build'], { cwd, env });
    }
  }
}

async function start(paths, env, settings, manager) {
  startupTimeout(env);
  const apps = await manager.call('list');
  if (apps.some(app => app.name === 'forge-controller' && app.pm2_env.status === 'online')) {
    console.log('检测到已有守护器，检查实际就绪状态…');
    const activeSettings = JSON.parse(readFileSync(paths.settings, 'utf8'));
    return waitForStartup(paths, activeSettings, env);
  }
  if (await portOpen(settings.port)) throw new Error(`Control port ${settings.port} is occupied; stop the existing supervisor first`);
  for (const service of enabledServices(env, settings).filter(service => ['backend', 'frontend'].includes(service.name))) {
    if (await portOpen(service.port)) throw new Error(`Port ${service.port} is occupied; stop the existing ${service.name} first`);
  }
  writeFileSync(paths.settings, JSON.stringify(settings), { mode: 0o600 });
  const script = fileURLToPath(new URL('./controller.mjs', import.meta.url));
  if (apps.some(app => app.name === 'forge-controller')) await manager.call('delete', 'forge-controller');
  await manager.call('start', appOptions(paths, 'forge-controller', script, [paths.root],
    { KAI_SUPERVISOR_CONTROL_TOKEN: randomBytes(32).toString('hex') }));
  return waitForStartup(paths, settings, env);
}

async function stop(paths, settings, manager, context) {
  const { apps, options } = context;
  if (apps.length === 0) {
    const pid = daemonPid(paths);
    manager.disconnect();
    if (pid) {
      try { process.kill(pid, 'SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    return reportUnmanagedRuntime(paths, readConfig(paths.root), settings, options.scope);
  }
  if (options.scope && options.scope !== 'all' && settings.scope === 'all') {
    settings.scope = options.scope === 'frontend' ? 'backend' : 'frontend';
    writeFileSync(paths.settings, JSON.stringify(settings), { mode: 0o600 });
    const selected = apps.filter(app => options.scope === 'frontend' ? app.name === 'frontend'
      : !['frontend', 'forge-controller'].includes(app.name));
    for (const app of selected) await manager.call('delete', app.pm_id);
    console.log(`Stopped ${options.scope}; ${settings.scope} remains running.`);
    return;
  }
  if (options.scope && options.scope !== 'all' && options.scope !== settings.scope) {
    console.log(`${options.scope} is already stopped.`);
    return;
  }
  if (apps.some(app => app.name === 'forge-controller')) await manager.call('delete', 'forge-controller');
  for (const app of (await manager.call('list')).filter(app => app.name !== 'forge-controller')) await manager.call('delete', app.pm_id);
  // Disconnect before terminating the now-empty private daemon. PM2 7's
  // killDaemon callback can wait indefinitely on Windows pipe shutdown.
  const pid = daemonPid(paths);
  manager.disconnect();
  if (pid) {
    try { process.kill(pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  console.log('Forge stopped. Data and logs retained.');
}

export async function main(root, args) {
  const [command = 'help', ...rest] = args;
  if (['help', '--help', '-h'].includes(command)) {
    console.log('Isolated backend measurement:\nnode forge.mjs measure-startup [--port 18090] [--timeout-seconds 120] [--skip-build] [--application-jar PATH] [--output-root PATH] [--target-path /api/tools]\n');
    console.log('Forge source runtime (Node 22+, Java 21, Maven)\n\nnode forge.mjs start [--scope all|backend|frontend] [--mode dev|full]\nnode forge.mjs stop\nnode forge.mjs status\nnode forge.mjs restart\nnode forge.mjs logs [service]\nnode forge.mjs doctor\nnode forge.mjs prepare\n\nDocker is optional and is not used to run Forge.');
    return;
  }
  const paths = runtimePaths(root);
  const env = readConfig(root);
  const options = command === 'logs' ? {} : optionsFrom(rest);
  const requestedSettings = settingsFrom(env, options);
  const settings = existsSync(paths.settings) && !['start', 'prepare', 'doctor'].includes(command)
    ? JSON.parse(readFileSync(paths.settings, 'utf8')) : requestedSettings;
  if (command === 'doctor') return doctor(paths, env);
  if (command === 'prepare') return prepare(paths, env, settings);
  if (['stop', 'status'].includes(command) && !daemonPid(paths)) {
    return reportUnmanagedRuntime(paths, env, settings, options.scope);
  }
  const manager = await connectManager(paths);
  try {
    if (command === 'start') return await start(paths, env, settings, manager);
    if (command === 'logs') {
      const name = rest[0] || 'forge-controller';
      if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid service name');
      for (const suffix of ['.log', '.error.log']) {
        const file = join(paths.logs, name + suffix);
        if (existsSync(file)) console.log(`${file}\n${recentLog(file)}`);
      }
      return;
    }
    const apps = await manager.call('list');
    if (command === 'stop') {
      await stop(paths, settings, manager, { apps, options });
    } else if (command === 'restart') {
      const controller = apps.find(app => app.name === 'forge-controller');
      if (!controller) throw new Error('Forge is not running; use start');
      if (controller.pm2_env.status === 'online') {
        const response = await fetch(`http://127.0.0.1:${settings.port}/full-reload`, {
          method: 'POST', headers: { 'X-Restart-Token': controller.pm2_env.KAI_SUPERVISOR_CONTROL_TOKEN },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`Reload rejected (${response.status}); inspect status and retry`);
      } else await manager.call('restart', 'forge-controller');
      console.log('Forge reload requested; use status to check readiness.');
    } else if (command === 'status') {
      if (apps.length === 0) return await reportUnmanagedRuntime(paths, env, settings, options.scope);
      if (apps.some(app => app.name === 'forge-controller' && app.pm2_env.status === 'online')) {
        try {
          const response = await fetch(`http://127.0.0.1:${settings.port}/status`, { signal: AbortSignal.timeout(3000) });
          const status = await response.json();
          if (status.implementation === 'forge-node-pm2' && status.repoRoot === paths.root) {
            console.log(JSON.stringify(status, null, 2));
            return;
          }
        } catch { console.log('Controller health unavailable; showing process state.'); }
      }
      // Never print PM2 raw objects: they contain environment secrets.
      console.log(JSON.stringify(apps.map(app => ({ name: app.name, pid: app.pid, state: app.pm2_env.status,
        restarts: app.pm2_env.restart_time })), null, 2));
    } else throw new Error(`Unknown command: ${command}`);
  } finally { manager.disconnect(); }
}
