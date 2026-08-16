import assert from 'node:assert/strict'
import test from 'node:test'
import { EngineCatalog } from './engineCatalog.js'
import { DEEPSEEK_HARNESS_SDK_VERSION, type DeepSeekHarnessAdapterDependencies } from './deepSeekHarnessAdapter.js'

function readyDependencies(counter: { clients: number }): DeepSeekHarnessAdapterDependencies {
  return {
    sdkVersion: DEEPSEEK_HARNESS_SDK_VERSION,
    createClient: () => {
      counter.clients += 1
      return {
        start: () => undefined,
        initialize: async () => ({
          serverInfo: { name: 'deepseek-harness-sdk-runtime', version: '0.1.0-rc.6' },
        }),
        prompt: async () => 'unused',
        subscribeSessionTree: () => { throw new Error('unused') },
        close: async () => undefined,
      }
    },
  }
}

test('catalog hides experimental engine selection when its runtime is disabled', async () => {
  const catalog = new EngineCatalog({
    antigravityProbe: async () => ({ status: 'incompatible', engine: 'antigravity' }),
    deepSeekConfig: {
      enabled: false,
      runtimeArgs: [],
      cwd: process.cwd(),
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      handshakeTimeoutMs: 100,
      turnTimeoutMs: 100,
    },
  })

  const entries = await catalog.list()

  assert.deepEqual(entries.filter(entry => entry.selectable).map(entry => entry.id), [
    'claude', 'codex', 'opencode',
  ])
  assert.equal(entries.find(entry => entry.id === 'deepseekHarness')?.probe.status, 'disabled')
})

test('catalog exposes DeepSeek only after an official runtime handshake and caches the probe', async () => {
  const counter = { clients: 0 }
  const catalog = new EngineCatalog({
    antigravityProbe: async () => ({ status: 'ready', engine: 'antigravity' }),
    deepSeekConfig: {
      enabled: true,
      runtimeCommand: 'fake-runtime',
      runtimeArgs: [],
      cwd: process.cwd(),
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      handshakeTimeoutMs: 100,
      turnTimeoutMs: 100,
    },
    deepSeekDependencies: readyDependencies(counter),
  })

  assert.equal(await catalog.selectable('deepseekHarness'), true)
  assert.equal((await catalog.list()).find(entry => entry.id === 'deepseekHarness')?.selectable, true)
  assert.equal(counter.clients, 1)
})

test('catalog exposes Antigravity only after its structured-output probe is ready', async () => {
  const catalog = new EngineCatalog({
    antigravityProbe: async () => ({ status: 'ready', engine: 'antigravity', runtimeVersion: '1.1.8' }),
    deepSeekConfig: {
      enabled: false, runtimeArgs: [], cwd: process.cwd(), provider: 'deepseek-official', model: 'deepseek-v4-flash',
      handshakeTimeoutMs: 100, turnTimeoutMs: 100,
    },
  })
  assert.equal(await catalog.selectable('antigravity'), true)
  assert.equal(catalog.selectableNow('antigravity'), true)
})
