import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexResponseWatchdog } from './codexResponseWatchdog.js'

test('silence is diagnostic only, including a turn lasting more than two hours', () => {
  const watch = new CodexResponseWatchdog(); watch.start(0)
  watch.observe({ type: 'turnActivity' }, 119000)
  watch.observe({ type: 'toolActivity', watchdogGenerated: true }, 119000)
  assert.equal(watch.check(119999), undefined)
  assert.deepEqual(watch.check(120000), { idleMs: 120000 })
  for (let now = 130000; now <= 3 * 60 * 60_000; now += 10000) {
    watch.observe({ type: 'turnActivity' }, now)
    assert.equal(watch.check(now), undefined, 'no repeated alert or interrupt during silence')
  }
  watch.observe({ type: 'assistantDelta' }, 3 * 60 * 60_000)
  assert.equal(watch.check(3 * 60 * 60_000 + 119999), undefined)
  assert.deepEqual(watch.check(3 * 60 * 60_000 + 120000), { idleMs: 120000 })
})

test('active tool and user confirmation are excluded; tool result resumes model deadline', () => {
  const watch = new CodexResponseWatchdog(); watch.start(0)
  watch.observe({ type: 'toolUse', toolCallId: 'a' }, 1)
  assert.equal(watch.check(600000), undefined)
  watch.observe({ type: 'toolResult', toolCallId: 'a' }, 600000)
  assert.deepEqual(watch.check(720000), { idleMs: 120000 })
  watch.observe({ type: 'permissionRequest' }, 720001)
  assert.equal(watch.check(1200000), undefined)
  watch.observe({ type: 'assistantDelta' }, 1200001)
  assert.equal(watch.check(1200002), undefined)
})

test('engine terminal prevents timeout during process cleanup', () => {
  const watch = new CodexResponseWatchdog(); watch.start(0)
  watch.observe({ type: 'result' }, 1)
  assert.equal(watch.check(600000), undefined)
})

test('a long task with genuine progress has no overall duration deadline', () => {
  const watch = new CodexResponseWatchdog(); watch.start(0)
  for (let now = 60000; now <= 3 * 60 * 60_000; now += 60000) {
    watch.observe({ type: 'codexActivity', status: 'inProgress' }, now)
    assert.equal(watch.check(now), undefined)
  }
})

test('a subsequent turn resets terminal, tool, waiting and diagnostic state', () => {
  const watch = new CodexResponseWatchdog(); watch.start(0)
  assert.deepEqual(watch.check(120000), { idleMs: 120000 })
  watch.observe({ type: 'toolUse', toolCallId: 'old' }, 120001)
  watch.observe({ type: 'questionRequest' }, 120002)
  watch.observe({ type: 'result', stopReason: 'interrupted' }, 120003)
  watch.start(200000)
  assert.equal(watch.check(319999), undefined)
  assert.deepEqual(watch.check(320000), { idleMs: 120000 })
})
