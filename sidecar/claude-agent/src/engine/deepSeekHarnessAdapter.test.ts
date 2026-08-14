import assert from 'node:assert/strict'
import test from 'node:test'
import type { HarnessNotification, NotificationSubscription } from '@deepseek-ai/dsh-sdk-client'
import {
  DEEPSEEK_HARNESS_SDK_VERSION,
  DeepSeekHarnessAdapter,
  createReadyDeepSeekHarnessAdapter,
  type DeepSeekHarnessAdapterConfig,
  type DeepSeekHarnessAdapterDependencies,
} from './deepSeekHarnessAdapter.js'
import type { AgentEvent, EngineTurnRequest } from './engineContract.js'

class FakeSubscription implements NotificationSubscription {
  private index = 0
  private rejectPending?: (reason?: unknown) => void
  closed = false

  constructor(private readonly notifications: HarnessNotification[]) {}

  async next(): Promise<HarnessNotification> {
    const value = this.notifications[this.index++]
    if (!value) {
      return new Promise((_, reject) => { this.rejectPending = reject })
    }
    return value
  }

  tryNext(): HarnessNotification | undefined {
    return this.notifications[this.index++]
  }

  close(): void {
    this.closed = true
    this.rejectPending?.(new Error('runtime closed'))
    this.rejectPending = undefined
  }

  async *[Symbol.asyncIterator](): AsyncIterator<HarnessNotification> {
    while (!this.closed) yield await this.next()
  }
}

function config(overrides: Partial<DeepSeekHarnessAdapterConfig> = {}): DeepSeekHarnessAdapterConfig {
  return {
    enabled: true,
    runtimeCommand: 'fake-runtime',
    runtimeArgs: [],
    cwd: 'D:\\workspace',
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    handshakeTimeoutMs: 100,
    turnTimeoutMs: 100,
    ...overrides,
  }
}

function dependencies(options: {
  sdkVersion?: string
  notifications?: HarnessNotification[]
  initialize?: () => Promise<{ serverInfo: { name: string; version: string } }>
  onClose?: () => void
  } = {}): DeepSeekHarnessAdapterDependencies {
  return {
    sdkVersion: options.sdkVersion ?? DEEPSEEK_HARNESS_SDK_VERSION,
    createClient: () => {
      let subscription: FakeSubscription | undefined
      return {
        start: () => undefined,
        initialize: options.initialize ?? (async () => ({
          serverInfo: { name: 'deepseek-harness-sdk-runtime', version: '0.1.0-rc.6' },
        })),
        prompt: async () => 'message-1',
        subscribeSessionTree: () => {
          subscription = new FakeSubscription(options.notifications ?? [])
          return subscription
        },
        close: async () => {
          subscription?.close()
          options.onClose?.()
        },
      }
    },
  }
}

function turn(events: AgentEvent[]): EngineTurnRequest {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    text: 'Review the repository',
    additionalDirectories: [],
    emit: event => events.push(event),
  }
}

test('experimental adapter stays unavailable unless explicitly enabled and configured', async () => {
  const disabled = new DeepSeekHarnessAdapter(config({ enabled: false }), dependencies())
  const missingRuntime = new DeepSeekHarnessAdapter(config({ runtimeCommand: undefined }), dependencies())

  assert.equal((await disabled.probe()).status, 'disabled')
  assert.equal((await missingRuntime.probe()).status, 'unavailable')
})

test('adapter rejects an SDK version outside the pinned developer-preview contract', async () => {
  const adapter = new DeepSeekHarnessAdapter(config(), dependencies({ sdkVersion: '0.1.0-rc.7' }))

  const probe = await adapter.probe()

  assert.equal(probe.status, 'incompatible')
  assert.match(probe.detail ?? '', /Expected/)
})

test('factory only exposes an adapter after the official runtime handshake succeeds', async () => {
  const ready = await createReadyDeepSeekHarnessAdapter(config(), dependencies())
  const incompatible = await createReadyDeepSeekHarnessAdapter(config(), dependencies({
    initialize: async () => ({ serverInfo: { name: 'other-runtime', version: '1' } }),
  }))

  assert.equal(ready.probe.status, 'ready')
  assert.ok(ready.adapter)
  assert.equal(incompatible.probe.status, 'incompatible')
  assert.equal(incompatible.adapter, undefined)
  await ready.adapter?.dispose()
})

test('adapter streams normalized events and completes only after the authoritative idle snapshot', async () => {
  const notifications: HarnessNotification[] = [
    {
      method: 'session.event',
      params: {
        sessionId: 'session-1',
        event: { type: 'agent/inbox/spliced', data: { inserted: [{ id: 'message-1' }] } },
      },
    },
    {
      method: 'session.event',
      params: {
        sessionId: 'session-1',
        event: {
          type: 'assistant/message',
          data: { message: { content: [{ type: 'text', text: 'Reviewed' }] } },
        },
      },
    },
    { method: 'session.status', params: { sessionId: 'session-1', status: 'idle' } },
  ]
  const events: AgentEvent[] = []
  const adapter = new DeepSeekHarnessAdapter(config(), dependencies({ notifications }))

  await adapter.runTurn(turn(events))

  assert.deepEqual(events.map(event => event.type), [
    'turn.started',
    'engine.diagnostic',
    'assistant.delta',
    'engine.diagnostic',
    'turn.completed',
  ])
  assert.equal(events.find(event => event.type === 'assistant.delta')?.payload.text, 'Reviewed')
  await adapter.dispose()
})

test('adapter normalizes streamed text and tool lifecycle without duplicating committed assistant messages', async () => {
  const notifications = [
    {
      method: 'session.event',
      params: { sessionId: 'session-1', event: { type: 'agent/inbox/spliced', data: { inserted: [{ id: 'message-1' }] } } },
    },
    {
      method: 'session.event',
      params: { sessionId: 'session-1', event: { type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Checking' } } } },
    },
    {
      method: 'session.event',
      params: { sessionId: 'session-1', event: { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'Checking' }] } } } },
    },
    {
      method: 'session.event',
      params: { sessionId: 'session-1', event: { type: 'tool/call', data: { turn: 1, step: 1, callId: 'call-1', name: 'read_file', arguments: '{"path":"README.md"}' } } },
    },
    {
      method: 'session.event',
      params: { sessionId: 'session-1', event: { type: 'tool/result', data: { turn: 1, step: 1, message: { content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'ok' }] }] } } } },
    },
    { method: 'session.status', params: { sessionId: 'session-1', status: 'idle' } },
  ] as HarnessNotification[]
  const events: AgentEvent[] = []
  const adapter = new DeepSeekHarnessAdapter(config(), dependencies({ notifications }))

  await adapter.runTurn(turn(events))

  assert.equal(events.filter(event => event.type === 'assistant.delta').length, 1)
  assert.deepEqual(events.find(event => event.type === 'tool.started')?.payload.input, { path: 'README.md' })
  assert.equal(events.find(event => event.type === 'tool.completed')?.payload.output, 'ok')
  await adapter.dispose()
})

test('adapter publishes replacement subagent snapshots with normalized terminal states', async () => {
  const notifications = [
    {
      method: 'session.event',
      params: { sessionId: 'session-1', event: { type: 'agent/inbox/spliced', data: { inserted: [{ id: 'message-1' }] } } },
    },
    {
      method: 'subagent.started',
      params: { parentSessionId: 'session-1', childSessionId: 'child-1' },
    },
    {
      method: 'subagent.finished',
      params: { parentSessionId: 'session-1', childSessionId: 'child-1', agentId: 'child-1', provider: 'local', status: 'completed', stopReason: 'end_turn' },
    },
    { method: 'session.status', params: { sessionId: 'session-1', status: 'idle' } },
  ] as HarnessNotification[]
  const events: AgentEvent[] = []
  const adapter = new DeepSeekHarnessAdapter(config(), dependencies({ notifications }))

  await adapter.runTurn(turn(events))

  const snapshots = events.filter(event => event.type === 'subagents.snapshot')
  assert.equal(snapshots.length, 2)
  assert.deepEqual(snapshots[0]?.payload.agents, [
    { id: 'child-1', parentId: 'session-1', state: 'running' },
  ])
  assert.deepEqual(snapshots[1]?.payload.agents, [
    { id: 'child-1', parentId: 'session-1', state: 'completed' },
  ])
  await adapter.dispose()
})

test('turn timeout closes the runtime before reporting failure', async () => {
  let closed = false
  const events: AgentEvent[] = []
  const adapter = new DeepSeekHarnessAdapter(config({ turnTimeoutMs: 10 }), dependencies({
    notifications: [],
    onClose: () => { closed = true },
  }))

  await assert.rejects(adapter.runTurn(turn(events)), /timed out/)

  assert.equal(closed, true)
  assert.equal(events.at(-1)?.type, 'turn.failed')
})

test('native interrupt reaps the runtime and reports an interrupted terminal event', async () => {
  let closed = false
  const events: AgentEvent[] = []
  const adapter = new DeepSeekHarnessAdapter(config({ turnTimeoutMs: 1_000 }), dependencies({
    notifications: [],
    onClose: () => { closed = true },
  }))

  const running = adapter.runTurn(turn(events))
  await new Promise(resolve => setTimeout(resolve, 5))
  await adapter.interrupt()
  await assert.rejects(running)

  assert.equal(closed, true)
  assert.equal(events.at(-1)?.type, 'turn.interrupted')
})
