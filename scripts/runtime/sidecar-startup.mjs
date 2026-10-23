import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connect } from 'node:net';
import { basename, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareNode } from './services.mjs';
import { npmCommand, run } from './commands.mjs';

const execute = promisify(execFile);

export function sidecarPort(env) {
  const port = Number(env.CLAUDE_CHAT_SIDECAR_PORT || 18890);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Claude Sidecar port');
  return port;
}

export function portListening(port) {
  return new Promise(yes => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = listening => { socket.removeAllListeners(); socket.destroy(); yes(listening); };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** Only absolute entry arguments establish workspace ownership; legacy relative argv is ambiguous. */
export function isOwnedOrphan(owner, entry, platform = process.platform) {
  if (!owner || owner.parentAlive !== false || !Number.isInteger(owner.pid) || owner.pid <= 1) return false;
  const normalize = value => platform === 'win32' ? value.replaceAll('\\', '/').toLowerCase() : value;
  const executable = normalize(owner.executable || '').split('/').at(-1);
  if (executable !== 'node' && executable !== 'node.exe') return false;
  const command = normalize(owner.commandLine || '').trim();
  const target = normalize(resolve(entry));
  const argv = command.match(/^(?:"[^"]+"|\S+)\s+("[^"]+"|\S+)$/);
  return Boolean(argv && argv[1].replace(/^"|"$/g, '') === target);
}

/** Read-only OS inventory, bounded so a failed process query cannot hang backend startup. */
export async function inspectPortOwner(port) {
  const options = { timeout: 15_000, windowsHide: true, maxBuffer: 256 * 1024 };
  if (process.platform === 'win32') {
    const ports = await execute('netstat.exe', ['-ano', '-p', 'tcp'], options);
    const pids = [...new Set(ports.stdout.split(/\r?\n/).flatMap(line => {
      const parts = line.trim().split(/\s+/);
      return parts.length === 5 && parts[3] === 'LISTENING' && parts[1].endsWith(`:${port}`) ? [Number(parts[4])] : [];
    }))];
    if (pids.length !== 1 || !Number.isInteger(pids[0]) || pids[0] <= 1) return null;
    const script = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pids[0]}'; if(!$p){exit}; $parent=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.ParentProcessId); [pscustomobject]@{pid=[int]$p.ProcessId; executable=$p.ExecutablePath; commandLine=$p.CommandLine; createdAt=$p.CreationDate.ToString('o'); parentAlive=[bool]($parent -and $parent.CreationDate -le $p.CreationDate)} | ConvertTo-Json -Compress`;
    const args = ['-NoProfile', '-NonInteractive', '-Command', script];
    let query;
    try { query = await execute('pwsh.exe', args, options); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Windows PowerShell must not inherit PowerShell 7's module search paths.
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
      query = await execute('powershell.exe', args, { ...options, env });
    }
    const { stdout } = query;
    return stdout.trim() ? JSON.parse(stdout) : null;
  }
  const { stdout } = await execute('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], options);
  const pids = [...new Set(stdout.trim().split(/\s+/).filter(Boolean))];
  if (pids.length !== 1 || !/^\d+$/.test(pids[0])) return null;
  const pid = Number(pids[0]);
  const info = await execute('ps', ['-p', String(pid), '-o', 'ppid=', '-o', 'comm=', '-o', 'args='], options);
  const match = info.stdout.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
  if (!match) return null;
  let parentAlive = Number(match[1]) > 1;
  try { if (parentAlive) process.kill(Number(match[1]), 0); }
  catch (error) { if (error.code === 'ESRCH') parentAlive = false; }
  return { pid, executable: basename(match[2]), commandLine: match[3], parentAlive };
}

/** Return a visible AI startup block instead of taking the entire backend down on a port conflict. */
export async function prepareSidecarPort(entry, port, dependencies = {}) {
  const { probe = portListening, inspect = inspectPortOwner, terminate = pid => process.kill(pid, 'SIGTERM'),
    sleep = delay, now = Date.now, timeoutMs = 15_000 } = dependencies;
  const waitUntil = async deadline => {
    while (await probe(port)) {
      if (now() >= deadline) return false;
      await sleep(250);
    }
    return true;
  };
  if (await waitUntil(now() + timeoutMs)) return null;
  try {
    const owner = await inspect(port);
    if (isOwnedOrphan(owner, entry)) {
      // Re-read identity immediately before termination; never trust a stale PID file alone.
      const current = await inspect(port);
      if (isOwnedOrphan(current, entry) && current.pid === owner.pid && current.createdAt === owner.createdAt) {
        console.warn(`[sidecar-startup] 回收本工作区遗留 Sidecar pid=${owner.pid}, port=${port}`);
        await terminate(owner.pid);
        if (await waitUntil(now() + 5000)) return null;
      }
    }
  } catch (error) {
    console.warn(`[sidecar-startup] 无法确认或回收遗留 Sidecar：${error.killed ? '进程查询超时' : error.code || error.name}`);
  }
  if (!await probe(port)) return null;
  return `Claude Sidecar 端口 ${port} 未释放，未构建或启动 AI 运行时。Forge 后端继续启动；请通过原所属进程管理器停止占用者，再确认重启 Forge。无法确认归属的进程不会自动终止。`;
}

export async function prepareSidecarRuntime(directory, env, dependencies = {}) {
  const { prepare = prepareNode, build = () => run(npmCommand(env), ['run', 'build'], { cwd: directory, env }),
    checkPort = prepareSidecarPort, probe = portListening } = dependencies;
  const port = sidecarPort(env);
  let blocked = await checkPort(resolve(directory, 'dist/server.js'), port);
  if (!blocked) {
    await prepare(directory, env);
    console.log('[forge-stage] 构建 Agent Sidecar');
    try { await build(); }
    catch (error) {
      if (!await probe(port)) throw error;
      blocked = `Sidecar 构建期间端口 ${port} 被占用，构建未成功，AI 运行时未启动。请处理占用后确认重启 Forge。`;
    }
  }
  if (blocked) {
    console.error(`[sidecar-startup] ${blocked}`);
    const spring = JSON.parse(env.SPRING_APPLICATION_JSON || '{}');
    spring['toolbox.claude-chat.sidecar-startup-error'] = blocked;
    env.SPRING_APPLICATION_JSON = JSON.stringify(spring);
  }
}
