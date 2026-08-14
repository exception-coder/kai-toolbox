import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveEngineRuntimeSnapshot } from './runtimeStateCoordinator.js'

test('authoritative adapter state wins over local inference', () => {
  assert.deepEqual(deriveEngineRuntimeSnapshot({
    active: true,
    pendingDecision: false,
    hasActiveController: false,
    authoritativeAgentState: 'running',
  }), {
    transport: 'connected',
    agentState: 'running',
    stateSource: 'adapter',
  })
})

test('local observations distinguish idle waiting finalizing and unknown', () => {
  assert.equal(deriveEngineRuntimeSnapshot({
    active: false, pendingDecision: false, hasActiveController: false,
  }).agentState, 'idle')
  assert.equal(deriveEngineRuntimeSnapshot({
    active: true, pendingDecision: true, hasActiveController: true,
  }).agentState, 'waiting')
  assert.equal(deriveEngineRuntimeSnapshot({
    active: true, pendingDecision: false, phase: 'finalizing', hasActiveController: false,
  }).agentState, 'finalizing')
  assert.equal(deriveEngineRuntimeSnapshot({
    active: true, pendingDecision: false, hasActiveController: false,
  }).agentState, 'unknown')
})
