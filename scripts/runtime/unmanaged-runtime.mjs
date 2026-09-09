import { portOpen } from './control.mjs';
import { enabledServices } from './services.mjs';

/** Diagnose occupied ports without adopting or terminating their owners. */
export async function reportUnmanagedRuntime(paths, env, settings, scope = 'all') {
  const relevant = enabledServices(env, { ...settings, scope });
  const ports = [...new Set([...relevant.map(service => service.port), ...(scope === 'all' ? [settings.port] : [])])];
  const occupied = (await Promise.all(ports.map(async port => await portOpen(port) ? port : null))).filter(Boolean);
  if (occupied.length === 0) {
    console.log('没有由新守护器管理的运行服务，相关端口也未监听，无需停止。');
    return;
  }
  let legacy = false;
  try {
    const response = await fetch(`http://127.0.0.1:${settings.port}/status`, { signal: AbortSignal.timeout(1000) });
    const status = await response.json();
    legacy = status.repoRoot === paths.root && status.protocolVersion === 1 && status.implementation !== 'forge-node-pm2';
  } catch { /* An occupied port alone cannot establish process ownership. */ }
  console.error(`未停止运行中的服务：端口 ${occupied.join(', ')} 仍在监听，但不受新守护器管理。`);
  console.error(legacy ? '检测到当前项目的旧监督器。请先退出旧监督器终端，再使用 node forge.mjs start。'
    : '请在原启动终端或对应进程管理器停止这些服务；本命令不会按端口强杀进程。');
  process.exitCode = 1;
}
