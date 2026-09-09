import { existsSync, readFileSync, readdirSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

export function readConfig(root, inherited = process.env) {
  const env = { ...inherited };
  const directory = join(root, 'scripts/run-tools.d');
  const files = existsSync(directory)
    ? readdirSync(directory).filter(name => name.endsWith('.conf')).sort().map(name => join(directory, name)) : [];
  files.push(join(root, 'scripts/run-tools.conf'));
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim();
    }
  }
  return env;
}

export function flag(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  if (/^(true|1|yes|on)$/i.test(value)) return true;
  if (/^(false|0|no|off)$/i.test(value)) return false;
  throw new Error(`Invalid boolean configuration: ${value}`);
}

export function runtimePaths(root) {
  root = realpathSync(root);
  const identity = createHash('sha256').update(process.platform === 'win32' ? root.toLowerCase() : root).digest('hex').slice(0, 16);
  const home = resolve(process.env.FORGE_RUNTIME_HOME || join(homedir(), '.kai-toolbox/runtime', identity));
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const owner = join(home, 'workspace');
  try { writeFileSync(owner, root, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (readFileSync(owner, 'utf8') !== root) throw new Error('FORGE_RUNTIME_HOME belongs to another workspace');
  }
  return { root, home, pm2Home: join(home, 'pm2'), settings: join(home, 'settings.json'), logs: join(home, 'logs') };
}

export function settingsFrom(env, options = {}) {
  const scope = options.scope || env.FORGE_SCOPE || 'all';
  const mode = options.mode || env.FORGE_MODE || 'dev';
  if (!['all', 'frontend', 'backend'].includes(scope)) throw new Error('scope must be all, frontend or backend');
  if (!['dev', 'full'].includes(mode)) throw new Error('mode must be dev or full');
  const port = Number(options.port || env.FORGE_CONTROL_PORT || 18081);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid control port');
  const observability = options.observability || env.FORGE_OBSERVABILITY || 'external';
  if (!['external', 'phoenix', 'langfuse', 'off'].includes(observability)) throw new Error('Invalid observability mode');
  return { scope, mode, port, observability, hotReload: flag(options.hotReload ?? env.FORGE_HOT_RELOAD) };
}
