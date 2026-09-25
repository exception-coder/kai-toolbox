import assert from 'node:assert/strict'
import test from 'node:test'
import type { createOpencode } from '@opencode-ai/sdk'
import { opencodeGatewayOptions } from './opencodeGateway.js'
import { runOpencodeTurn } from '../opencodeEngine.js'

test('gateway options are per invocation and never mutate the parent environment', () => {
  const before = { ...process.env }
  const signal = new AbortController().signal
  const a = opencodeGatewayOptions({ apiBaseUrl: 'https://a.test/v1', authToken: 'key-a', model: 'model-a', signal })
  const b = opencodeGatewayOptions({ apiBaseUrl: 'https://b.test/v1', authToken: 'key-b', model: 'model-b', signal })
  assert.equal(a.port, 0)
  assert.equal(a.config.provider['forge-session'].options.apiKey, 'key-a')
  assert.equal(b.config.provider['forge-session'].options.apiKey, 'key-b')
  assert.equal(a.config.small_model, 'forge-session/model-a')
  assert.deepEqual(a.config.enabled_providers, ['forge-session'])
  assert.ok(JSON.stringify({ ...process.env }) === JSON.stringify(before), 'parent environment changed')
})

test('gateway rejects missing model/key and embedded URL credentials', () => {
  const signal = new AbortController().signal
  for (const settings of [
    { apiBaseUrl: 'https://a.test', model: 'm' },
    { apiBaseUrl: 'https://a.test', authToken: 'k' },
    { apiBaseUrl: 'https://user:pass@a.test', authToken: 'k', model: 'm' },
  ]) assert.throws(() => opencodeGatewayOptions({ ...settings, signal }))
})

test('gateway closes its runtime after success or configuration conflict', async () => {
  for (const conflict of [false, true]) {
    let closed = 0
    let prompted = 0
    const events: Record<string, unknown>[] = []
    const factory = (async (options: Parameters<typeof createOpencode>[0]) => ({
      client: {
        event: { subscribe: async () => ({ stream: (async function* () {})() }) },
        config: { get: async () => ({ data: conflict ? {} : options!.config }) },
        session: {
          create: async () => ({ data: { id: 'session-test' } }),
          prompt: async () => { prompted++; return { data: { parts: [{ id: 'p', type: 'text', text: 'OK' }] } } },
        },
      },
      server: { url: 'http://localhost:1', close: () => { closed++ } },
    })) as unknown as typeof createOpencode
    await runOpencodeTurn({ text: 'hello', cwd: process.cwd(), apiBaseUrl: 'https://a.test/v1',
      authToken: 'key-a', model: 'm', signal: new AbortController().signal,
      emit: event => events.push(event), setSdkSessionId: () => {},
      permissionMode: 'default', autoApprove: false, toolPolicy: 'standard' }, factory)
    assert.equal(closed, 1)
    assert.equal(prompted, conflict ? 0 : 1)
    assert.equal(events.some(event => event.type === 'error'), conflict)
    assert.ok(!JSON.stringify(events).includes('key-a'))
  }
})
