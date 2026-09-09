import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export async function connectManager(paths) {
  mkdirSync(paths.pm2Home, { recursive: true, mode: 0o700 });
  mkdirSync(paths.logs, { recursive: true, mode: 0o700 });
  // Never inherit another PM2 installation's socket, PID or home overrides.
  for (const key of Object.keys(process.env)) if (key.startsWith('PM2_')) delete process.env[key];
  delete process.env.OVER_HOME;
  process.env.PM2_HOME = paths.pm2Home;
  process.env.PM2_NO_INTERACTION = 'true';
  process.env.PM2_DISCRETE_MODE = 'true';
  process.env.PM2_PROGRAMMATIC = 'true';
  const require = createRequire(import.meta.url);
  require('./pm2-isolation.cjs');
  const pm2 = require('pm2');
  const originalOptions = process.env.NODE_OPTIONS;
  const preload = `--require ${JSON.stringify(fileURLToPath(new URL('./pm2-isolation.cjs', import.meta.url)))}`;
  process.env.FORGE_PM2_PRELOAD = preload;
  process.env.NODE_OPTIONS = `${originalOptions || ''} ${preload}`.trim();
  try { await new Promise((yes, no) => pm2.connect(error => error ? no(error) : yes())); }
  finally {
    if (originalOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = originalOptions;
    delete process.env.FORGE_PM2_PRELOAD;
  }
  return {
    call: (method, ...args) => new Promise((yes, no) => pm2[method](...args, (error, value) => error ? no(error) : yes(value))),
    disconnect: () => pm2.disconnect(),
  };
}

export function appOptions(paths, name, script, args, env = {}) {
  return { name, script, args, cwd: paths.root, interpreter: process.execPath, exec_mode: 'fork',
    instances: 1, autorestart: true, min_uptime: 60000, max_restarts: 5, restart_delay: 3000,
    kill_timeout: 15000, treekill: true, windowsHide: true, merge_logs: true,
    out_file: join(paths.logs, `${name}.log`), error_file: join(paths.logs, `${name}.error.log`),
    env: { ...env, FORGE_RUNTIME_HOME: paths.home },
  };
}

export function daemonPid(paths) {
  try {
    const pid = Number(readFileSync(join(paths.pm2Home, 'pm2.pid'), 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0);
    return pid;
  } catch { return null; }
}
