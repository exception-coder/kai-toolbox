import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { flag } from './config.mjs';
import { executable, npmCommand, run } from './commands.mjs';

export function serviceCatalog(env, platform = process.platform) {
  const wechat = flag(env.FORGE_WECHAT_ENABLED, platform === 'win32');
  if (wechat && platform !== 'win32') throw new Error('WeChat desktop automation requires Windows; set FORGE_WECHAT_ENABLED=false');
  const whisperMode = env.TOOLBOX_WHISPER_MODE || (platform === 'darwin' ? 'asr-service' : 'cli');
  return [
    { name: 'backend', port: servicePort(env.FORGE_BACKEND_PORT, 18080) },
    { name: 'frontend', port: servicePort(env.FORGE_FRONTEND_PORT, 5173) },
    { name: 'visitor-analysis', port: 9600, python: true, enabled: flag(env.FORGE_VISITOR_ANALYSIS_ENABLED, true) },
    { name: 'faster-whisper', port: 9500, python: true, enabled: whisperMode === 'asr-service' },
    { name: 'wechat', port: 9700, python: true, enabled: wechat },
    { name: 'studio', port: 3000, enabled: flag(env.FORGE_STUDIO_ENABLED, Boolean(env.AS_STUDIO_URL)) },
  ];
}

function servicePort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid service port');
  return port;
}

export function enabledServices(env, settings) {
  return serviceCatalog(env).filter(service => service.name === 'frontend' ? settings.scope !== 'backend'
    : settings.scope !== 'frontend' && service.enabled !== false);
}

export async function prepareNode(directory, env) {
  const fingerprint = createHash('sha256').update(readFileSync(join(directory, 'package-lock.json'))).digest('hex');
  const marker = join(directory, 'node_modules/.forge-lock');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === fingerprint) return;
  await run(npmCommand(env), ['ci', '--no-audit', '--no-fund'], { cwd: directory, env });
  mkdirSync(join(directory, 'node_modules'), { recursive: true });
  writeFileSync(marker, fingerprint);
}

export async function preparePython(root, service, env) {
  const directory = join(root, 'python-services', service.name);
  const python = join(directory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!existsSync(python)) {
    const base = executable(process.platform === 'win32' ? 'python' : 'python3', env.PYTHON_CMD, env);
    await run({ file: base, args: [] }, ['-m', 'venv', '.venv'], { cwd: directory, env });
  }
  const marker = join(directory, '.venv/.forge-requirements');
  const fingerprint = createHash('sha256').update(readFileSync(join(directory, 'requirements.txt'))).digest('hex');
  if (!existsSync(marker) || readFileSync(marker, 'utf8') !== fingerprint) {
    await run({ file: python, args: [] }, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: directory, env });
    writeFileSync(marker, fingerprint);
  }
  return { file: python, args: ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', String(service.port)] };
}
