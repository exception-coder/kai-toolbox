import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retireService } from '../retired-services.mjs';

test('retirement removes only the retired managed process and is repeatable', async () => {
  let apps = [{ name: 'wechat', pm_id: 3 }, { name: 'backend', pm_id: 1 }, { name: 'frontend', pm_id: 2 }];
  const removed = [];
  const manager = { call: async (command, id) => {
    if (command === 'list') return apps;
    assert.equal(command, 'delete');
    removed.push(id);
    apps = apps.filter(app => app.pm_id !== id);
  } };
  await assert.rejects(retireService(manager, 'backend'), /not retired/);
  await retireService(manager, 'wechat');
  await retireService(manager, 'wechat');
  assert.deepEqual(removed, [3]);
  assert.deepEqual(apps.map(app => app.name), ['backend', 'frontend']);
});
