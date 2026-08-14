import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexTurnCompletionGate, codexIncompleteTurnMessage } from './codexTurnCompletion.js'

test('allows queue release after a final root assistant response', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  assert.deepEqual(gate.assess('completed'), {
    queueReleaseSafe: true,
    activeSubAgentCount: 0,
  })
})

test('keeps the queue when an App Server turn completes without a final response', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', { type: 'commandExecution', status: 'completed' })

  const assessment = gate.assess('completed')
  assert.equal(assessment.queueReleaseSafe, false)
  assert.equal(assessment.reason, 'finalResponseMissing')
})

test('keeps the queue while any spawned sub-agent has not reached a terminal state', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', {
    type: 'subAgentActivity',
    kind: 'started',
    agentThreadId: 'agent-1',
  })
  gate.observeItem('completed', { type: 'agentMessage', status: 'completed' })

  const assessment = gate.assess('completed')
  assert.equal(assessment.queueReleaseSafe, false)
  assert.equal(assessment.reason, 'subAgentsActive')
  assert.equal(assessment.activeSubAgentCount, 1)
  assert.match(codexIncompleteTurnMessage(assessment), /1 个子 Agent/)
})

test('allows queue release after all sub-agents settle and the root sends its final response', () => {
  const gate = new CodexTurnCompletionGate()
  gate.observeItem('completed', {
    type: 'collabAgentToolCall',
    tool: 'spawnAgent',
    receiverThreadIds: ['agent-1'],
    agentsStates: { 'agent-1': { status: 'running' } },
  })
  gate.observeItem('completed', {
    type: 'subAgentActivity',
    kind: 'completed',
    agentThreadId: 'agent-1',
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
