import { openSync, fstatSync, readSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';

const names = { backend: '后端', frontend: '前端', 'visitor-analysis': '访客分析', wechat: '微信服务', studio: 'AgentScope Studio', 'faster-whisper': '语音服务' };

export function startupTimeout(env) {
  const seconds = Number(env.FORGE_START_TIMEOUT_SECONDS || 600);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error('FORGE_START_TIMEOUT_SECONDS 必须为 1–3600 秒');
  return seconds * 1000;
}

function currentStage(paths, service) {
  const file = join(paths.logs, `${service.name}.log`);
  if (!existsSync(file)) return '正在准备';
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, 32768));
    readSync(fd, buffer, 0, buffer.length, size - buffer.length);
    const stages = [...buffer.toString('utf8').matchAll(/\[forge-stage\] ([^\r\n]+)/g)];
    return stages.at(-1)?.[1] || '正在构建或启动';
  } finally { closeSync(fd); }
}

/** Only local development HTTPS probes accept the workspace's self-signed certificate. */
export function responds(url) {
  return new Promise(resolve => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, { rejectUnauthorized: false }, response => {
      response.resume();
      resolve(response.statusCode < 400 || [401, 403].includes(response.statusCode));
    });
    request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    request.once('error', () => resolve(false));
  });
}

async function readyUrls(snapshot, env) {
  const urls = {};
  if (snapshot.backendEnabled && snapshot.backendReady) {
    const url = `http://127.0.0.1:${env.FORGE_BACKEND_PORT || 18080}`;
    if (await responds(`${url}/api/tools`)) urls.backend = url;
  }
  if (snapshot.frontendEnabled && snapshot.frontendReady) {
    for (const protocol of ['https', 'http']) {
      const url = `${protocol}://localhost:${env.FORGE_FRONTEND_PORT || 5173}`;
      if (await responds(url.replace('localhost', '127.0.0.1'))) { urls.frontend = url; break; }
    }
  }
  return urls;
}

export async function waitForStartup(paths, settings, env, hooks = {}) {
  const timeout = startupTimeout(env);
  const started = Date.now();
  const readStatus = hooks.readStatus || (async () => {
    const response = await fetch(`http://127.0.0.1:${settings.port}/status`, { signal: AbortSignal.timeout(2000) });
    return response.json();
  });
  const probe = hooks.probe || (snapshot => readyUrls(snapshot, env));
  const emit = hooks.emit || console.log;
  let previous = '', printedAt = 0;
  emit(`正在启动 Forge，等待前后端就绪（最长 ${timeout / 1000} 秒）…`);
  emit('Ctrl+C 可结束等待；后台服务继续运行，停止请用 node forge.mjs stop。');
  while (Date.now() - started < timeout) {
    let snapshot;
    try { snapshot = await readStatus(); } catch { /* The controller may still be binding or recovering. */ }
    if (snapshot?.implementation === 'forge-node-pm2' && snapshot.repoRoot === paths.root) {
      const core = snapshot.services.filter(service => ['backend', 'frontend'].includes(service.name));
      const failed = core.find(service => service.state === 'errored' || (service.state === 'not_started' && snapshot.bootstrapAttached));
      if (failed) throw new Error(`${names[failed.name]}启动失败。${snapshot.lastError || ''}\n查看原因：node forge.mjs logs ${failed.name}\n日志目录：${paths.logs}`);
      const urls = await probe(snapshot);
      const summary = core.map(service => `${names[service.name]}：${urls[service.name] ? '已就绪' : service.state === 'waiting restart'
        ? `已退出，正在重试（${service.restarts}）` : service.ready ? '等待 HTTP 响应' : currentStage(paths, service)}`).join(' ｜ ');
      if (summary !== previous || Date.now() - printedAt >= 15000) {
        emit(`[${Math.round((Date.now() - started) / 1000)}s] ${summary || '控制器正在初始化'}`);
        previous = summary; printedAt = Date.now();
      }
      if (snapshot.servicesReady && core.length > 0 && core.every(service => urls[service.name])) {
        emit(`\nForge 主服务启动成功（${Math.round((Date.now() - started) / 1000)} 秒）。`);
        if (urls.frontend) emit(`工作台：${urls.frontend}`);
        if (urls.backend) emit(`后端：${urls.backend}`);
        for (const service of snapshot.services.filter(service => !['backend', 'frontend'].includes(service.name))) {
          emit(`${names[service.name] || service.name}：${service.ready ? '已就绪' : service.state === 'errored' ? '启动失败' : '尚未就绪'}${service.ready ? '' : `，查看：node forge.mjs logs ${service.name}`}`);
        }
        emit('服务将在后台继续运行。停止：node forge.mjs stop');
        return;
      }
    } else if (Date.now() - printedAt >= 15000) {
      emit('正在等待守护器响应…'); printedAt = Date.now();
    }
    await delay(hooks.pollMs || 1000);
  }
  throw new Error(`启动等待超时，尚未确认主服务就绪。后台仍在运行，可再次执行 node forge.mjs start 继续等待。\n诊断：node forge.mjs status；node forge.mjs logs；node forge.mjs logs backend；node forge.mjs logs frontend\n日志目录：${paths.logs}`);
}
