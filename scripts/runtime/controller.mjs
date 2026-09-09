import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimePaths, readConfig, flag } from './config.mjs';
import { connectManager, appOptions, daemonPid } from './process-manager.mjs';
import { enabledServices } from './services.mjs';
import { controlServer, portOpen } from './control.mjs';

const root = process.argv[2];
const paths = runtimePaths(root);
const settings = JSON.parse(readFileSync(paths.settings, 'utf8'));
const env = readConfig(root);
const token = process.env.KAI_SUPERVISOR_CONTROL_TOKEN;
if (!token) throw new Error('Controller must be started through forge.mjs');
const manager = await connectManager(paths);
const currentServices = () => enabledServices(env, JSON.parse(readFileSync(paths.settings, 'utf8')));
const runner = fileURLToPath(new URL('./runner.mjs', import.meta.url));
let lastError = null;
let initializing = true;
const report = error => { lastError = error.message; console.error(`[controller] ${error.message}`); };

async function stopServices(names) {
  const apps = await manager.call('list');
  for (const app of apps.filter(app => names.includes(app.name))) await manager.call('delete', app.pm_id);
}

async function startServices(selected) {
  for (const service of selected) {
    if (await portOpen(service.port)) {
      report(new Error(`${service.name}: port ${service.port} is occupied; stop its existing owner before restarting Forge`));
      continue;
    }
    const options = appOptions(paths, service.name, runner, [root, service.name], { KAI_SUPERVISOR_CONTROL_TOKEN: token });
    if (service.name === 'backend') {
      options.shutdown_with_message = true;
      if (settings.hotReload) {
        options.watch = [join(root, 'tools'), join(root, 'toolbox-common/src'), join(root, 'toolbox-starter/src')];
        options.ignore_watch = ['node_modules', 'target', '\\.git'];
        options.watch_delay = 2000;
      }
    }
    await manager.call('start', options);
  }
}

async function status() {
  const apps = await manager.call('list');
  const states = await Promise.all(currentServices().map(async service => {
    const app = apps.find(item => item.name === service.name);
    const up = app?.pm2_env.status === 'online';
    return { name: service.name, pid: app?.pid || null, state: app?.pm2_env.status || 'not_started',
      ready: up && await portOpen(service.port), restarts: app?.pm2_env.restart_time || 0 };
  }));
  const backend = states.find(item => item.name === 'backend');
  const frontend = states.find(item => item.name === 'frontend');
  const bootstrapPid = daemonPid(paths);
  const attached = !initializing && Boolean(bootstrapPid && apps.some(app => app.name === 'forge-controller' && app.pid === process.pid));
  return { protocolVersion: 1, implementation: 'forge-node-pm2', repoRoot: paths.root,
    capabilities: { fullReload: attached }, bootstrapAttached: attached, bootstrapPid,
    backendEnabled: Boolean(backend), backendUp: backend?.state === 'online', backendReady: backend?.ready || false,
    frontendEnabled: Boolean(frontend), frontendUp: frontend?.state === 'online', frontendReady: frontend?.ready || false,
    servicesReady: !initializing && (!backend || backend.ready) && (!frontend || frontend.ready),
    pid: backend?.pid || null, controllerPid: process.pid, services: states, lastError,
    autoUpdate: { owner: 'java', enabled: flag(env.TOOLBOX_AUTO_UPDATE_ENABLED, true), state: 'managed_by_java' } };
}

const server = controlServer({ status, internalToken: token, externalToken: env.TOOLBOX_SUPERVISOR_RESTART_TOKEN,
  onError: report, mutate: async action => {
    const services = currentServices();
    const selected = action === 'reload' ? services : services.filter(service => service.name !== 'frontend');
    await stopServices(selected.map(service => service.name));
    if (action === 'reload') {
      server.close();
      manager.disconnect();
      process.exit(0);
    }
    await startServices(selected);
  } });

try {
  await new Promise((yes, no) => { server.once('error', no); server.listen(settings.port, '127.0.0.1', yes); });
  // On a controller crash, retained service processes belong to this private PM2 instance.
  const apps = await manager.call('list');
  await stopServices(apps.filter(app => app.name !== 'forge-controller').map(app => app.name));
  await startServices(currentServices());
  initializing = false;
  console.log(`Forge control ready at http://127.0.0.1:${settings.port}`);
} catch (error) { report(error); server.close(); manager.disconnect(); process.exit(1); }
