import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CodexTurnCompletionGate,
  codexFinalizingTurnMessage,
} from './codexTurnCompletion.js'

test('allows queue release after a final root assistant response', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  assert.deepEqual(gate.assess('completed'), {
    queueReleaseSafe: true,
    finalizingRequired: false,
    activeSubAgentCount: 0,
  })
})

test('keeps the queue when an App Server turn completes without a final response', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', { type: 'commandExecution', status: 'completed' })

  const assessment = gate.assess('completed')
  assert.equal(assessment.queueReleaseSafe, false)
  assert.equal(assessment.finalizingRequired, false)
  assert.equal(assessment.reason, 'finalResponseMissing')
})

test('does not treat subAgentActivity as an authoritative child-agent state collection', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', {
    type: 'subAgentActivity',
    kind: 'started',
    agentThreadId: 'agent-1',
  })
  gate.observeItem('completed', {
    type: 'subAgentActivity',
    kind: 'interacted',
    agentThreadId: 'agent-1',
  })
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  const assessment = gate.assess('completed')
  assert.equal(assessment.queueReleaseSafe, false)
  assert.equal(assessment.finalizingRequired, true)
  assert.equal(assessment.reason, 'subAgentStateUnconfirmed')
  assert.equal(assessment.activeSubAgentCount, 0)
})

test('uses the latest agentsStates snapshot instead of accumulating stale child agents', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', {
    type: 'collabAgentToolCall',
    tool: 'spawnAgent',
    receiverThreadIds: ['agent-1', 'agent-2'],
    agentsStates: {
      'agent-1': { status: 'running' },
      'agent-2': { status: 'pendingInit' },
    },
  })
  gate.observeItem('completed', {
    type: 'collabAgentToolCall',
    tool: 'wait',
    receiverThreadIds: ['agent-2'],
    agentsStates: { 'agent-2': { status: 'completed' } },
  })
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  assert.deepEqual(gate.assess('completed'), {
    queueReleaseSafe: true,
    finalizingRequired: false,
    activeSubAgentCount: 0,
  })
})

test('enters finalizing when the latest authoritative snapshot still reports running agents', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', {
    type: 'collabAgentToolCall',
    tool: 'wait',
    receiverThreadIds: ['agent-1'],
    agentsStates: { 'agent-1': { status: 'running' } },
  })
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  const assessment = gate.assess('completed')
  assert.equal(assessment.queueReleaseSafe, false)
  assert.equal(assessment.finalizingRequired, true)
  assert.equal(assessment.activeSubAgentCount, 1)
  assert.match(codexFinalizingTurnMessage(assessment), /1 个活动子 Agent/)
})

test('root final response and turn completion win after the finalizing recheck', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', {
    type: 'subAgentActivity',
    kind: 'started',
    agentThreadId: 'agent-1',
  })
  gate.observeItem('completed', {
    type: 'collabAgentToolCall',
    tool: 'wait',
    receiverThreadIds: ['agent-1'],
    agentsStates: { 'agent-1': { status: 'running' } },
  })
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  assert.deepEqual(gate.assess('completed', true), {
    queueReleaseSafe: true,
    finalizingRequired: false,
    activeSubAgentCount: 1,
  })
})

test('matches the official multi-agent event order through terminal agentsStates', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', {
    type: 'subAgentActivity', kind: 'started', agentThreadId: 'agent-1',
  })
  gate.observeItem('completed', {
    type: 'subAgentActivity', kind: 'interacted', agentThreadId: 'agent-1',
  })
  gate.observeItem('completed', {
    type: 'collabAgentToolCall',
    tool: 'wait',
    receiverThreadIds: ['agent-1', 'agent-2'],
    agentsStates: {
      'agent-1': { status: 'completed' },
      'agent-2': { status: 'errored' },
    },
  })
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  assert.equal(gate.assess('completed').queueReleaseSafe, true)
})

test('invalidates an earlier assistant progress message when later work continues', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })
  gate.observeItem('completed', { type: 'dynamicToolCall', status: 'completed' })

  assert.equal(gate.assess('completed').reason, 'finalResponseMissing')
})

test('never allows a failed upstream turn to release the queue', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  assert.equal(gate.assess('failed').reason, 'turnFailed')
})
