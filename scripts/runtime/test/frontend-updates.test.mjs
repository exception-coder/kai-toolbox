import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrontendUpdater } from '../frontend/runtime.mjs';

test('serializes commit-driven builds, retains ready version after failure and resumes on a new tree', async () => {
  const old = { version: 'a'.repeat(24) };
  let next = { tree: 'tree-b', version: 'b'.repeat(24), revision: 'commit-b' };
  let state = { ready: true, version: old.version };
  let calls = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const check = createFrontendUpdater({ paths: { root: '/fixture', home: '/fixture/runtime' }, settings: {}, env: {}, initialActive: old,
    persist: async patch => { state = { ...state, ...patch }; }, identify: async () => next, read: async () => null, prune: async () => {},
    build: async () => { calls++; if (calls === 1) { await pending; throw new Error('fixture compiler failed'); } return next; } });
  const first = check();
  await new Promise(resolve => setImmediate(resolve));
  await check(); assert.equal(calls, 1);
  assert.equal(state.version, old.version); assert.equal(state.buildState, 'building');
  release(); await first;
  assert.equal(state.ready, true); assert.equal(state.buildState, 'failed'); assert.equal(state.version, old.version);
  await check(); assert.equal(calls, 1);
  next = { tree: 'tree-c', version: 'c'.repeat(24), revision: 'commit-c' };
  await check(); assert.equal(calls, 2); assert.equal(state.version, next.version); assert.equal(state.buildState, 'ready');
});

test('manual-only mode adopts a verified manually published version without auto-building', async () => {
  const next = { version: 'b'.repeat(24) }; let verified = false, state = {};
  const check = createFrontendUpdater({ paths: { root: '/fixture', home: '/fixture/runtime' }, settings: { frontendAutoBuild: false }, env: {},
    initialActive: { version: 'a'.repeat(24) }, persist: async patch => { state = { ...state, ...patch }; },
    identify: async () => ({ tree: 'new-tree', version: 'c'.repeat(24) }), read: async () => next,
    verify: async () => { verified = true; }, build: () => assert.fail('manual-only mode must not build') });
  await check(); assert.equal(verified, true); assert.equal(state.ready, true); assert.equal(state.version, next.version);
});
