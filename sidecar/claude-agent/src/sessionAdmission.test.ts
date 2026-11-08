import assert from 'node:assert/strict'
import test from 'node:test'
import { Session, SessionManager } from './sessionManager.js'

test('user dispatch claims the native turn before returning to the WebSocket receiver', async () => {
  let started = false
  const manager = {
    sessions: new Map([['s', {
      toolPolicy: 'default',
      runTurn: async () => { started = true },
    }]]),
  } as unknown as SessionManager
  SessionManager.prototype.user.call(manager, 's', 'task', undefined, undefined, [], 't1')
  assert.equal(started, true, 'an idle snapshot must not slip between receipt and turn start')
})

test('pending preparation owns the turn and blocks a completion check until cleanup', async () => {
  const events: Record<string, unknown>[] = []
  const session = new Session('s', process.cwd(), event => events.push(event))
  let release!: () => void
  const preparing = new Promise<void>(resolve => { release = resolve })
  let executions = 0
  Object.assign(session, { executeTurn: async () => { executions++ } })
  const running = session.runTurn('task', undefined, undefined, undefined, 't1', [], undefined, () => preparing)
  try {
    assert.equal(session.runtimeState().active, true)
    assert.equal(session.runtimeState().activeTurnId, 't1')
    await session.runTurn('completion check', undefined, undefined, undefined, 'check')
    assert.equal(executions, 0)
    assert.equal(session.runtimeState().activeTurnId, 't1')
    assert.ok(events.some(event => event.type === 'error' && event.code === 'TURN_BUSY'))
  } finally {
    release()
    await running
  }
  assert.equal(executions, 1)
  assert.equal(session.runtimeState().active, false)
  assert.equal(events.filter(event => event.type === 'result' && event.turnId === 't1').length, 1)
})

test('preparation failure releases its reservation with one failed terminal result', async () => {
  const events: Record<string, unknown>[] = []
  const session = new Session('s', process.cwd(), event => events.push(event))
  let executions = 0
  Object.assign(session, { executeTurn: async () => { executions++ } })
  await session.runTurn('task', undefined, undefined, undefined, 'failed', [], undefined,
    async () => { throw new Error('preparation unavailable') })
  assert.equal(executions, 0)
  assert.equal(session.runtimeState().active, false)
  assert.deepEqual(events.filter(event => event.type === 'result').map(event => [event.turnId, event.stopReason]),
    [['failed', 'error']])
  await session.runTurn('next', undefined, undefined, undefined, 'next')
  assert.equal(executions, 1)
  assert.equal(session.runtimeState().active, false)
})

test('interrupt during preparation prevents model execution after preparation finishes', async () => {
  const events: Record<string, unknown>[] = []
  const session = new Session('s', process.cwd(), event => events.push(event))
  let release!: () => void
  const preparing = new Promise<void>(resolve => { release = resolve })
  let executions = 0
  Object.assign(session, { executeTurn: async () => { executions++ } })
  const running = session.runTurn('task', undefined, undefined, undefined, 'cancelled', [], undefined, () => preparing)
  try {
    assert.equal(session.interrupt('cancelled').outcome, 'accepted')
    assert.equal(session.runtimeState().active, true)
  } finally {
    release()
    await running
  }
  assert.equal(executions, 0)
  assert.deepEqual(events.filter(event => event.type === 'result').map(event => [event.turnId, event.stopReason]),
    [['cancelled', 'interrupted']])
  assert.equal(session.runtimeState().active, false)
})
