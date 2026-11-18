import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { join, delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { runtimePaths, readConfig, flag } from './config.mjs';
import { connectManager, appOptions } from './process-manager.mjs';

const PRIMARY = 'cloudflare';
const REPLICA = 'cloudflare-replica';

export function tunnelAsset(platform, arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported cloudflared architecture: ${arch}`);
  const cpu = arch === 'x64' ? 'amd64' : 'arm64';
  if (platform === 'win32') return `cloudflared-windows-${cpu}.exe`;
  if (platform === 'linux') return `cloudflared-linux-${cpu}`;
  if (platform === 'darwin') return `cloudflared-darwin-${cpu}.tgz`;
  throw new Error(`Unsupported cloudflared platform: ${platform}`);
}

export function tunnelArguments(config, protocol = 'http2', bindAddress) {
  if (!['http2', 'quic', 'auto'].includes(protocol)) throw new Error('Invalid tunnel protocol');
  const args = ['tunnel', '--no-autoupdate', '--protocol', protocol, '--config', config];
  if (bindAddress) {
    if (!isIP(bindAddress)) throw new Error('Cloudflare edge bind address must be an IP address');
    args.push('--edge-bind-address', bindAddress);
  }
  return [...args, 'run'];
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

export function managedTunnelConfig(env, interfaces = networkInterfaces()) {
  if (!flag(env.FORGE_CLOUDFLARE_ENABLED, false)) return null;
  const config = env.FORGE_CLOUDFLARE_CONFIG || join(homedir(), '.kai-toolbox', 'cloudflared', 'config.yml');
  const hostname = validateConfig(config);
  if (!hostname) throw new Error('Managed Cloudflare tunnel requires a named hostname in config.yml');
  const protocol = env.FORGE_CLOUDFLARE_PROTOCOL || 'http2';
  const primaryAddress = env.FORGE_CLOUDFLARE_EDGE_BIND_ADDRESS;
  const replicaAddress = env.FORGE_CLOUDFLARE_REPLICA_BIND_ADDRESS;
  const args = tunnelArguments(config, protocol, primaryAddress);
  if (!replicaAddress) return { config, hostname, args };

  const replicaArgs = tunnelArguments(config, 'http2', replicaAddress);
  const interfaceFor = address => Object.entries(interfaces).find(([, entries]) =>
    entries?.some(entry => !entry.internal && entry.address === address))?.[0];
  const primaryInterface = interfaceFor(primaryAddress);
  const replicaInterface = interfaceFor(replicaAddress);
  if (!primaryAddress || primaryAddress === replicaAddress || (primaryInterface && primaryInterface === replicaInterface)) {
    throw new Error('Cloudflare replicas require explicit bind addresses on two distinct local network interfaces');
  }
  const unavailable = new Set();
  if (!primaryInterface) unavailable.add(PRIMARY);
  if (!replicaInterface) unavailable.add(REPLICA);
  return { config, hostname, args, replicaArgs, unavailable };
}

function argValue(args, option) {
  const position = Array.isArray(args) ? args.indexOf(option) : -1;
  return position < 0 ? undefined : args[position + 1];
}

export function activeTunnelApp(apps) {
  const connectors = [PRIMARY, REPLICA].map(name => apps.find(app => app.name === name)).filter(Boolean);
  return connectors.find(app => app.pm2_env.status === 'online')
    || connectors.find(app => !['errored', 'stopped'].includes(app.pm2_env.status)) || connectors[0];
}

export function tunnelReplicas(apps) {
  return apps.filter(app => [PRIMARY, REPLICA].includes(app.name));
}

function describeConnector(app, name, absent = 'stopped') {
  return app ? { name, pid: app.pid, state: app.pm2_env.status,
    restarts: app.pm2_env.restart_time } : { name, state: absent };
}

export function tunnelSnapshot(apps, replicaConfigured, absent) {
  const active = activeTunnelApp(apps);
  const snapshot = describeConnector(active, active?.name || PRIMARY, absent);
  if (replicaConfigured || apps.some(app => app.name === REPLICA)) {
    snapshot.connectors = [PRIMARY, REPLICA].map(name =>
      describeConnector(apps.find(app => app.name === name), name, absent));
  }
  return snapshot;
}

/** Idempotent startup path shared with the Forge controller; PM2 owns bounded crash retries. */
export async function ensureManagedTunnel(manager, paths, env, binary = cloudflaredBinary, interfaces) {
  const plan = managedTunnelConfig(env, interfaces);
  if (!plan) return { enabled: false };
  const apps = await manager.call('list');
  const connectors = [[PRIMARY, plan.args]];
  if (plan.replicaArgs) {
    connectors.push([REPLICA, plan.replicaArgs]);
    for (const [name, args] of connectors) {
      const existing = apps.find(app => app.name === name);
      if (!existing) continue;
      const running = existing.pm2_env.args;
      const runningConfig = argValue(running, '--config');
      if (running?.includes('--url') || !runningConfig || resolve(runningConfig) !== resolve(plan.config)
        || ['--protocol', '--edge-bind-address'].some(option => argValue(running, option) !== argValue(args, option))) {
        throw new Error(`${name} is configured differently; use the authorized tunnel stop/start workflow to apply new bindings`);
      }
    }
  }
  let executable;
  const errors = [];
  for (const [name, args] of connectors) {
    const existing = apps.find(app => app.name === name);
    if (existing?.pm2_env.status === 'online') continue;
    if (plan.unavailable?.has(name)) {
      errors.push(`${name}: the configured bind address is not assigned to a local network interface`);
      continue;
    }
    if (existing) {
      errors.push(`${name} is not online; inspect its logs before retrying startup`);
      continue;
    }
    try {
      executable ??= await binary();
      await manager.call('start', { ...appOptions(paths, name, executable, args),
        interpreter: 'none', autorestart: true });
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  return { enabled: true, hostname: plan.hostname, pid: activeTunnelApp(apps)?.pid };
}

/** Public responses verify routing and origin reachability, not just a live PM2 process. */
export async function probeNamedTunnel(hostname, request = fetch) {
  if (!hostname || !/^[a-z0-9.-]+$/i.test(hostname)) return { state: 'unverified', reason: 'NAMED_HOSTNAME_MISSING' };
  const checks = [];
  for (const route of ['/', '/api/tools']) {
    try {
      const response = await request(`https://${hostname}${route}`, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
      });
      const reachable = route === '/' ? response.status >= 200 && response.status < 400 : response.status === 200;
      checks.push({ route, status: response.status, reachable });
      await response.body?.cancel();
    } catch (error) {
      checks.push({ route, reachable: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { state: checks.every(check => check.reachable) ? 'ready' : 'failed', hostname, checks };
}

export async function tunnelMain(root, args) {
  const [command = 'status', ...options] = args;
  if (!['start', 'stop', 'status', 'check'].includes(command)) throw new Error('Use node forge.mjs tunnel start|stop|status|check');
  const env = readConfig(root);
  const defaultConfig = join(homedir(), '.kai-toolbox', 'cloudflared', 'config.yml');
  let config = env.FORGE_CLOUDFLARE_CONFIG || defaultConfig;
  let protocol;
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
    const existing = apps.find(app => app.name === PRIMARY);
    if (command === 'stop') {
      for (const app of tunnelReplicas(apps)) await manager.call('delete', app.pm_id);
      console.log('Cloudflare tunnel stopped; credentials and DNS retained.');
      return;
    }
    if (command === 'start' && !quick && env.FORGE_CLOUDFLARE_REPLICA_BIND_ADDRESS) {
      if (resolver) throw new Error('--dns-resolver is unavailable in replica mode');
      await ensureManagedTunnel(manager, paths, { ...env, FORGE_CLOUDFLARE_ENABLED: 'true',
        FORGE_CLOUDFLARE_CONFIG: config, FORGE_CLOUDFLARE_PROTOCOL: protocol ?? env.FORGE_CLOUDFLARE_PROTOCOL });
    } else if (command === 'start' && quick && apps.some(app => app.name === REPLICA)) {
      throw new Error('Stop the named Cloudflare connectors before starting a Quick Tunnel');
    } else if (command === 'start' && !existing) {
      let hostname;
      let tunnelArgs;
      if (quick) {
        config = join(paths.home, 'cloudflare-quick.yml');
        tunnelArgs = quickArguments(config, url, protocol);
        writeFileSync(config, '{}\n', { mode: 0o600 });
        hostname = 'temporary trycloudflare.com URL (see logs)';
      } else {
        hostname = validateConfig(config);
        tunnelArgs = tunnelArguments(config, protocol ?? env.FORGE_CLOUDFLARE_PROTOCOL,
          env.FORGE_CLOUDFLARE_EDGE_BIND_ADDRESS);
      }
      if (resolver && quick) throw new Error('--dns-resolver is supported only for named tunnels');
      if (resolver) tunnelArgs.push('--dns-resolver-addrs', resolver);
      const binary = await cloudflaredBinary();
      await manager.call('start', { ...appOptions(paths, 'cloudflare', binary, tunnelArgs),
        interpreter: 'none', autorestart: !quick });
      console.log(`Tunnel process launched for ${hostname}; public readiness is not yet verified. Inspect node forge.mjs logs cloudflare.`);
    } else if (command === 'start' && existing.pm2_env.status !== 'online') {
      throw new Error('Existing tunnel is not online; inspect logs, then explicitly stop/start after diagnosis');
    }
    const currentApps = await manager.call('list');
    const app = activeTunnelApp(currentApps);
    const snapshot = tunnelSnapshot(currentApps, env.FORGE_CLOUDFLARE_REPLICA_BIND_ADDRESS);
    let health = { state: 'stopped' };
    if (app?.pm2_env.status === 'online') {
      const runningArgs = Array.isArray(app.pm2_env.args) ? app.pm2_env.args : [];
      const configPosition = runningArgs.indexOf('--config');
      const activeConfig = configPosition >= 0 ? runningArgs[configPosition + 1] : config;
      if (runningArgs.includes('--url') || quick) health = { state: 'unverified', reason: 'QUICK_TUNNEL_URL_IN_LOGS' };
      else {
        try {
          const hostname = validateConfig(activeConfig);
          health = await probeNamedTunnel(hostname);
          if (command === 'start') for (let attempt = 0; attempt < 5 && health.state === 'failed'; attempt++) {
            await pause(1000);
            health = await probeNamedTunnel(hostname);
          }
        } catch (error) { health = { state: 'failed', reason: error instanceof Error ? error.message : String(error) }; }
      }
    }
    console.log(JSON.stringify({ ...snapshot, health }, null, 2));
    if (command === 'check' && health.state !== 'ready') process.exitCode = 1;
  } finally { manager.disconnect(); }
}
