// Only removed modules may be retired without restarting the remaining runtime.
const retiredServices = new Set(['wechat']);

export async function retireService(manager, name) {
  if (!retiredServices.has(name)) throw new Error(`Service is not retired: ${name}`);
  const apps = await manager.call('list');
  for (const app of apps.filter(app => app.name === name)) {
    await manager.call('delete', app.pm_id);
  }
}
