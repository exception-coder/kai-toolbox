import assert from 'node:assert/strict'
import test from 'node:test'
import { publicAgentEvent, type AgentEvent } from './engineContract.js'

test('public agent event strips provider-native payloads at the Sidecar boundary', () => {
  const event: AgentEvent = {
    protocolVersion: 1,
    eventId: 'event-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    engine: 'deepseekHarness',
    type: 'engine.diagnostic',
    observedAt: 123,
    payload: { status: 'running' },
    native: { token: 'must-not-leak', providerSpecific: true },
  }

  assert.deepEqual(publicAgentEvent(event), {
    protocolVersion: 1,
    eventId: 'event-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    engine: 'deepseekHarness',
    type: 'engine.diagnostic',
    observedAt: 123,
    payload: { status: 'running' },
  })
})
