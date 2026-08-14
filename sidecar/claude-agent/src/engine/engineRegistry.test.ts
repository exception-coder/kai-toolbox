import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentEngineAdapter, EngineDescriptor } from './engineContract.js'
import { EngineAdapterRegistry } from './engineRegistry.js'
import { builtinEngineRegistry } from './builtinEngineAdapters.js'

function adapter(descriptor: EngineDescriptor, calls: string[]): AgentEngineAdapter {
  return {
    descriptor,
    runTurn: async execution => {
      calls.push(descriptor.id)
      await execution.execute()
    },
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

  await registry.runTurn('claude', { execute: async () => { calls.push('native') } })

  assert.deepEqual(calls, ['claude', 'native'])
  assert.equal(registry.supports('claude', 'resume'), true)
  assert.equal(registry.supports('claude', 'subagents'), false)
})

test('registry rejects duplicate and unknown adapters explicitly', () => {
  const registry = new EngineAdapterRegistry([adapter(claudeDescriptor, [])])

  assert.throws(() => registry.register(adapter(claudeDescriptor, [])), /already registered/)
  assert.throws(() => registry.resolve('deepseekHarness'), /not registered/)
})

test('builtin registry exposes only implemented engines and their real capabilities', () => {
  assert.deepEqual(
    builtinEngineRegistry.descriptors().map(item => item.id),
    ['claude', 'codex', 'gemini', 'opencode'],
  )
  assert.equal(builtinEngineRegistry.supports('codex', 'subagents'), true)
  assert.equal(builtinEngineRegistry.supports('gemini', 'subagents'), false)
})
