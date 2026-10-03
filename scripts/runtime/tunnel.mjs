import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runtimePaths } from './config.mjs';
import { connectManager, appOptions } from './process-manager.mjs';

export function tunnelAsset(platform, arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported cloudflared architecture: ${arch}`);
  const cpu = arch === 'x64' ? 'amd64' : 'arm64';
  if (platform === 'win32') return `cloudflared-windows-${cpu}.exe`;
  if (platform === 'linux') return `cloudflared-linux-${cpu}`;
  if (platform === 'darwin') return `cloudflared-darwin-${cpu}.tgz`;
  throw new Error(`Unsupported cloudflared platform: ${platform}`);
}

export function tunnelArguments(config, protocol = 'http2') {
  if (!['http2', 'quic', 'auto'].includes(protocol)) throw new Error('Invalid tunnel protocol');
  return ['tunnel', '--no-autoupdate', '--protocol', protocol, '--config', config, 'run'];
}

export function quickArguments(config, url, protocol) {
  const origin = new URL(url);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Quick tunnel requires HTTP(S) origin');
  const args = tunnelArguments(config, protocol).slice(0, -1);
  args.push('--url', url);
  if (origin.protocol === 'https:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) args.push('--no-tls-verify');
  return args;
}

async function cloudflaredBinary() {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const directory = join(homedir(), '.kai-toolbox', 'bin');
  const cached = join(directory, name);
  const candidates = [process.env.CLOUDFLARED_CMD, cached,
    ...(process.env.PATH || '').split(delimiter).map(path => join(path, name))].filter(Boolean);
  const installed = candidates.find(path => existsSync(path));
  if (installed) return installed;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const asset = tunnelAsset(process.platform, process.arch);
  const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`cloudflared download failed: HTTP ${response.status}`);
  const temporary = join(directory, `${asset}.download`);
  writeFileSync(temporary, Buffer.from(await response.arrayBuffer()), { mode: 0o700 });
  if (asset.endsWith('.tgz')) {
    const extracted = spawnSync('tar', ['-xzf', temporary, '-C', directory, 'cloudflared'], { encoding: 'utf8' });
    if (extracted.status !== 0) throw new Error(`cloudflared extraction failed: ${extracted.stderr}`);
  } else renameSync(temporary, cached);
  chmodSync(cached, 0o700);
  return cached;
}

function validateConfig(config) {
  if (!existsSync(config)) throw new Error(`Missing tunnel config: ${config}; restore existing Cloudflare configuration first`);
  const contents = readFileSync(config, 'utf8');
  const credential = contents.match(/^credentials-file:\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
  if (!credential || !existsSync(credential)) throw new Error('Tunnel credential is missing; restore it without deleting the remote tunnel');
  return contents.match(/^\s*- hostname:\s*(\S+)/m)?.[1] || null;
}

export async function tunnelMain(root, args) {
  const [command = 'status', ...options] = args;
  if (!['start', 'stop', 'status'].includes(command)) throw new Error('Use node forge.mjs tunnel start|stop|status');
  let config = join(homedir(), '.kai-toolbox', 'cloudflared', 'config.yml');
  let protocol = 'http2';
  let quick = false;
  let url = 'https://localhost:5173';
  let resolver;
  for (let i = 0; i < options.length; i += 2) {
    if (options[i] === '--quick') { quick = true; i--; continue; }
    if (!options[i + 1]) throw new Error(`Missing value for ${options[i]}`);
    if (options[i] === '--config') config = options[i + 1];
    else if (options[i] === '--protocol') protocol = options[i + 1];
    else if (options[i] === '--url') url = options[i + 1];
    else if (options[i] === '--dns-resolver') resolver = options[i + 1];
    else throw new Error(`Unknown tunnel option: ${options[i]}`);
  }
  const paths = runtimePaths(root);
  const manager = await connectManager(paths);
  try {
    const apps = await manager.call('list');
    const existing = apps.find(app => app.name === 'cloudflare');
    if (command === 'stop') {
      if (existing) await manager.call('delete', existing.pm_id);
      console.log('Cloudflare tunnel stopped; credentials and DNS retained.');
      return;
    }
    if (command === 'start' && !existing) {
      let hostname;
      let tunnelArgs;
      if (quick) {
        config = join(paths.home, 'cloudflare-quick.yml');
        tunnelArgs = quickArguments(config, url, protocol);
        writeFileSync(config, '{}\n', { mode: 0o600 });
        hostname = 'temporary trycloudflare.com URL (see logs)';
      } else {
        hostname = validateConfig(config);
        tunnelArgs = tunnelArguments(config, protocol);
      }
      if (resolver && quick) throw new Error('--dns-resolver is supported only for named tunnels');
      if (resolver) tunnelArgs.push('--dns-resolver-addrs', resolver);
      const binary = await cloudflaredBinary();
      await manager.call('start', { ...appOptions(paths, 'cloudflare', binary, tunnelArgs),
        interpreter: 'none', autorestart: false });
      console.log(`Tunnel process launched for ${hostname}; public readiness is not yet verified. Inspect node forge.mjs logs cloudflare.`);
    } else if (command === 'start' && existing.pm2_env.status !== 'online') {
      throw new Error('Existing tunnel is not online; inspect logs, then explicitly stop/start after diagnosis');
    }
    const app = (await manager.call('list')).find(item => item.name === 'cloudflare');
    console.log(JSON.stringify(app ? { name: app.name, pid: app.pid, state: app.pm2_env.status,
      restarts: app.pm2_env.restart_time } : { name: 'cloudflare', state: 'stopped' }, null, 2));
  } finally { manager.disconnect(); }
}
