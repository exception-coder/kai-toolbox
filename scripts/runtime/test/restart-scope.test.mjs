import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restartRequest } from '../cli.mjs';

const controller = { pm2_env: { status: 'online', KAI_SUPERVISOR_CONTROL_TOKEN: 'internal' } };
const env = { TOOLBOX_SUPERVISOR_RESTART_TOKEN: 'external' };

test('backend restart uses the scoped endpoint and retains the running tunnel', () => {
  assert.deepEqual(restartRequest({ scope: 'backend' }, { scope: 'all' }, env, controller), {
    path: '/restart', token: 'external',
    message: 'Backend restart requested; frontend and Cloudflare tunnel remain running.',
  });
  assert.throws(() => restartRequest({ scope: 'backend' }, { scope: 'all' }, {}, controller), /requires TOOLBOX_SUPERVISOR_RESTART_TOKEN/);
  assert.throws(() => restartRequest({ scope: 'backend' }, { scope: 'all' }, env, null), /cannot preserve the tunnel/);
  assert.throws(() => restartRequest({ scope: 'backend' }, { scope: 'frontend' }, env, controller), /Backend is not enabled/);
});

test('full reload remains explicit and unsupported frontend scope cannot silently reload everything', () => {
  assert.equal(restartRequest({}, { scope: 'all' }, env, controller).path, '/full-reload');
  assert.throws(() => restartRequest({ scope: 'frontend' }, { scope: 'all' }, env, controller), /not supported/);
});
