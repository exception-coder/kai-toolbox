import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentEngineAdapter, EngineDescriptor } from './engineContract.js'
import { EngineAdapterRegistry } from './engineRegistry.js'
import { builtinEngineRegistry } from './builtinEngineAdapters.js'
import { deriveEngineRuntimeSnapshot } from './runtimeStateCoordinator.js'

function adapter(descriptor: EngineDescriptor, calls: string[]): AgentEngineAdapter {
  return {
    descriptor,
    runTurn: async request => {
      calls.push(descriptor.id)
      calls.push(request.text)
    },
    runtimeState: deriveEngineRuntimeSnapshot,
    interrupt: async () => { calls.push('interrupted') },
  }
}

const claudeDescriptor: EngineDescriptor = {
  id: 'claude',
  displayName: 'Claude Code',
  capabilities: new Set(['resume', 'interrupt']),
  availability: 'stable',
}

test('registry routes a turn through the selected adapter', async () => {
  const calls: string[] = []
  const registry = new EngineAdapterRegistry([adapter(claudeDescriptor, calls)])

  await registry.runTurn('claude', {
    sessionId: 'session-1',
    turnId: 'turn-1',
    text: 'native',
    additionalDirectories: [],
    emit: () => undefined,
  })

  assert.deepEqual(calls, ['claude', 'native'])
  assert.equal(registry.supports('claude', 'resume'), true)
  assert.equal(registry.supports('claude', 'subagents'), false)
})

test('registry exposes an explicit readiness result for adapters without an external probe', async () => {
  const registry = new EngineAdapterRegistry([adapter(claudeDescriptor, [])])

  assert.deepEqual(await registry.probe('claude'), {
    status: 'ready',
    engine: 'claude',
    detail: 'Adapter does not require an external runtime handshake',
  })
})

test('registry delegates runtime-state authority to the selected adapter', () => {
  const registry = new EngineAdapterRegistry([adapter(claudeDescriptor, [])])

  assert.equal(registry.runtimeState('claude', {
    active: true,
    pendingDecision: false,
    phase: 'finalizing',
    hasActiveController: false,
  }).agentState, 'finalizing')
})

test('registry delegates native cancellation and validates declared capabilities', async () => {
  const calls: string[] = []
  const registry = new EngineAdapterRegistry([adapter(claudeDescriptor, calls)])

  await registry.interrupt('claude')
  assert.deepEqual(calls, ['interrupted'])

  assert.throws(() => new EngineAdapterRegistry([{
    descriptor: claudeDescriptor,
    runTurn: async () => undefined,
  }]), /declares interrupt/)
})

test('registry rejects duplicate and unknown adapters explicitly', () => {
  const registry = new EngineAdapterRegistry([adapter(claudeDescriptor, [])])

  assert.throws(() => registry.register(adapter(claudeDescriptor, [])), /already registered/)
  assert.throws(() => registry.resolve('deepseekHarness'), /not registered/)
})

test('builtin registry exposes only implemented engines and their real capabilities', () => {
  assert.deepEqual(
    builtinEngineRegistry.descriptors().map(item => item.id),
    ['claude', 'codex', 'antigravity', 'opencode'],
  )
  assert.equal(builtinEngineRegistry.supports('codex', 'subagents'), true)
  assert.equal(builtinEngineRegistry.supports('antigravity', 'subagents'), false)
})
