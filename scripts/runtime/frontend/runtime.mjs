import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJson, readActive, pruneReleases, verifyRelease } from './releases.mjs';
import { buildRelease, sourceIdentity, frontendHome } from './build.mjs';
import { createFrontendServer, frontendTls } from './server.mjs';

export async function readFrontendStatus(paths, pid) {
  try {
    const state = JSON.parse(await readFile(join(frontendHome(paths), 'status.json'), 'utf8'));
    return state.pid === pid ? state : null;
  } catch { return null; }
}

export function createFrontendUpdater({ paths, settings, env, initialActive, persist,
  identify = sourceIdentity, build = buildRelease, read = readActive, verify = verifyRelease, prune = pruneReleases }) {
  const home = frontendHome(paths);
  let active = initialActive;
  let running = false, failedTree = null;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const published = await read(home);
      if (published && published.version !== active?.version) {
        await verify(join(home, 'releases', published.version));
        active = published;
        await persist({ version: active.version, ready: true, buildState: 'ready' });
      }
      const source = await identify(paths.root);
      if (source.version === active?.version || source.tree === failedTree || (settings.frontendAutoBuild === false && active)) return;
      await persist({ buildState: 'building', lastAttempt: source.version });
      console.log(`[forge-stage] 从已提交前端快照构建 ${source.version}`);
      try {
        active = await build(paths, env, { revision: source.revision });
        failedTree = null;
        await persist({ ready: true, version: active.version, buildState: 'ready' });
        console.log(`[forge-stage] 前端版本 ${active.version} 已发布，服务进程保持运行`);
        await prune(home, active.version).catch(error => console.error(`[frontend] Old release cleanup deferred: ${error.message}`));
      } catch (error) {
        failedTree = source.tree;
        await persist({ buildState: 'failed' });
        console.error(`[frontend] Candidate build failed; previous release retained: ${error.message}`);
      }
    } catch (error) { console.error(`[frontend] Update check failed: ${error.message}`); }
    finally { running = false; }
  };
  return tick;
}

export async function startStaticFrontend(paths, settings, env) {
  const home = frontendHome(paths);
  await mkdir(home, { recursive: true });
  let active = await readActive(home);
  if (active) {
    try { await verifyRelease(join(home, 'releases', active.version)); }
    catch { console.error('[frontend] Saved release failed integrity verification'); active = null; }
  }
  let state = { mode: 'static', pid: process.pid, ready: false, version: active?.version || null,
    buildState: 'idle', autoBuild: settings.frontendAutoBuild !== false, lastAttempt: null };
  const persist = async patch => { state = { ...state, ...patch }; await atomicJson(join(home, 'status.json'), state); };
  await persist({});
  const server = createFrontendServer({ home, state: () => state, tls: await frontendTls(env),
    backendPort: Number(env.FORGE_BACKEND_PORT || 18080), controlPort: settings.port });
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen(Number(env.FORGE_FRONTEND_PORT || 5173), env.FORGE_FRONTEND_HOST || '::', yes);
  });
  await persist({ ready: Boolean(active) });
  console.log('[forge-stage] 前端静态服务已监听，等待完整资源版本');
  const tick = createFrontendUpdater({ paths, settings, env, initialActive: active, persist });
  const interval = setInterval(() => void tick(), (settings.frontendPollSeconds || 15) * 1000);
  void tick();
  const close = () => { clearInterval(interval); server.close(); };
  process.once('SIGTERM', close); process.once('SIGINT', close);
  return new Promise((yes, no) => { server.once('close', yes); server.once('error', no); });
}
