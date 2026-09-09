import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig, runtimePaths } from './config.mjs';
import { npmCommand, run } from './commands.mjs';
import { prepareNode, preparePython, serviceCatalog } from './services.mjs';
import { serviceEnvironment } from './service-environment.mjs';
import { runBackend } from './source-backend.mjs';
import { createRequire } from 'node:module';

const [root, name] = process.argv.slice(2);
const paths = runtimePaths(root);
const settings = JSON.parse(readFileSync(paths.settings, 'utf8'));
const env = serviceEnvironment(root, settings, readConfig(root));

// PM2 can send IPC on Windows, where POSIX termination signals are unavailable.
if (name === 'backend') process.on('message', async message => {
  if (message !== 'shutdown') return;
  const token = env.TOOLBOX_SYSTEM_RESTART_TOKEN;
  // PM2's IPC timeout kills only the wrapper PID. Explicitly stop its owned
  // tree before that timeout so Maven/JVM descendants cannot become orphans.
  const killTree = createRequire(import.meta.url)('pm2/lib/TreeKill');
  setTimeout(() => killTree(process.pid, 'SIGTERM', () => process.exit(0)), token ? 10000 : 0);
  if (!token) return;
  try {
    await fetch(`http://127.0.0.1:${env.SERVER_PORT}/api/system/restart`, {
      method: 'POST', headers: { 'X-Restart-Token': token }, signal: AbortSignal.timeout(3000),
    });
  } catch { console.error('[backend] Graceful shutdown unavailable; PM2 will stop the owned process tree.'); }
});

async function backend() {
  console.log('[forge-stage] 准备 Agent Sidecar 依赖');
  const sidecar = join(root, 'sidecar/claude-agent');
  await prepareNode(sidecar, env);
  console.log('[forge-stage] 构建 Agent Sidecar');
  await run(npmCommand(env), ['run', 'build'], { cwd: sidecar, env });
  await runBackend(root, settings, env);
}

async function executeService() {
  if (name === 'backend') return backend();
  if (name === 'frontend') {
    console.log('[forge-stage] 准备前端依赖');
    const cwd = join(root, 'frontend');
    await prepareNode(cwd, env);
    console.log('[forge-stage] 构建前端插件并启动 Vite');
    return run(npmCommand(env), ['run', 'dev', '--', '--strictPort', '--port', env.FORGE_FRONTEND_PORT || '5173'], { cwd, env });
  }
  const service = serviceCatalog(env).find(item => item.name === name);
  if (service?.python) {
    const command = await preparePython(root, service, env);
    return run(command, [], { cwd: join(root, 'python-services', name), env });
  }
  if (name === 'studio') {
    const cwd = join(root, 'node-services/agentscope-studio');
    await prepareNode(cwd, env);
    return run({ file: process.execPath, args: [join(cwd, 'node_modules/@agentscope/studio/bin/cli.js')] }, [], { cwd, env });
  }
  throw new Error(`Unknown service: ${name}`);
}

try { await executeService(); process.exit(0); }
catch (error) { console.error(`[${name}] ${error.message}`); process.exit(1); }
