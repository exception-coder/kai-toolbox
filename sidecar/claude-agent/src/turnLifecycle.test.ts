import assert from 'node:assert/strict'
import test from 'node:test'
import { TurnLifecycle } from './turnLifecycle.js'

test('empty interrupt is acknowledged as already stopped', () => {
  const lifecycle = new TurnLifecycle()

  assert.deepEqual(lifecycle.requestInterrupt('turn-1', false), {
    outcome: 'alreadyStopped',
    active: false,
    pendingDecision: false,
  })
})

test('turn events carry turnId and duplicate terminal events are suppressed', () => {
  const lifecycle = new TurnLifecycle()
  assert.equal(lifecycle.begin('turn-1').accepted, true)

  assert.deepEqual(lifecycle.decorate({ type: 'assistantDelta', text: 'ok' }), {
    type: 'assistantDelta',
    text: 'ok',
    turnId: 'turn-1',
  })
  assert.equal(lifecycle.decorate({ type: 'result', stopReason: 'end_turn' }), null)
  assert.equal(lifecycle.decorate({ type: 'result', stopReason: 'interrupted' }), null)
  assert.equal(lifecycle.begin('turn-2').accepted, false, 'terminal emitted does not mean cleanup finished')
  assert.equal(lifecycle.snapshot('turn-1').active, true, 'finalizing turn remains active until cleanup finishes')
  assert.deepEqual(lifecycle.finish('turn-1'), {
    type: 'result',
    stopReason: 'end_turn',
    turnId: 'turn-1',
  })
  assert.equal(lifecycle.begin('turn-2').accepted, true, 'next turn starts only after cleanup releases the lock')
})

test('stale interrupt cannot stop a newer turn', () => {
  const lifecycle = new TurnLifecycle()
  lifecycle.begin('turn-new')

  assert.deepEqual(lifecycle.requestInterrupt('turn-old', false), {
    outcome: 'turnMismatch',
    active: true,
    pendingDecision: false,
    activeTurnId: 'turn-new',
  })
  assert.equal(lifecycle.fallbackStopReason(), 'end_turn')
})

test('accepted interrupt selects interrupted fallback terminal', () => {
  const lifecycle = new TurnLifecycle()
  lifecycle.begin('turn-1')

  assert.equal(lifecycle.requestInterrupt('turn-1', true).outcome, 'accepted')
  assert.equal(lifecycle.fallbackStopReason(), 'interrupted')
})

test('interrupt during cleanup revokes buffered success without releasing the writer early', () => {
  const lifecycle = new TurnLifecycle()
  lifecycle.begin('finishing')
  lifecycle.decorate({ type: 'result', stopReason: 'end_turn', queueReleaseSafe: true, usage: { input_tokens: 12 } })
  lifecycle.requestInterrupt('finishing', false)
  assert.equal(lifecycle.interrupted(), true)
  assert.equal(lifecycle.begin('next').accepted, false)
  assert.deepEqual(lifecycle.finish('finishing'), { type: 'result', turnId: 'finishing',
    stopReason: 'interrupted', queueReleaseSafe: false, usage: { input_tokens: 12 } })
})

test('a late successful native result cannot override an accepted interrupt', () => {
  const lifecycle = new TurnLifecycle()
  lifecycle.begin('running')
  lifecycle.requestInterrupt('running', false)
  lifecycle.decorate({ type: 'result', stopReason: 'end_turn', queueReleaseSafe: true })
  assert.equal(lifecycle.finish('running')?.stopReason, 'interrupted')
})

test('a stale interrupt leaves buffered success unchanged', () => {
  const lifecycle = new TurnLifecycle()
  lifecycle.begin('new')
  lifecycle.decorate({ type: 'result', stopReason: 'end_turn', queueReleaseSafe: true })
  lifecycle.requestInterrupt('old', false)
  assert.equal(lifecycle.interrupted(), false)
  assert.equal(lifecycle.finish('new')?.queueReleaseSafe, true)
})
