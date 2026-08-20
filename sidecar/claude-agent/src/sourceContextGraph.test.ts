import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_GRAPH_JSON_FALLBACK_MAX_BYTES,
  GraphifyQueryCoordinator,
  isGraphJsonSafeForFallback,
} from './sourceContextGraph.js'

test('coalesces identical Graphify queries', async () => {
  const coordinator = new GraphifyQueryCoordinator()
  let executions = 0
  let release!: (value: string) => void
  const pending = new Promise<string>(resolve => { release = resolve })
  const execute = () => {
    executions += 1
    return pending
  }

  const first = coordinator.resolve('same', execute, () => 'busy')
  const second = coordinator.resolve('same', execute, () => 'busy')
  release('graph-result')

  assert.equal(await first, 'graph-result')
  assert.equal(await second, 'graph-result')
  assert.equal(executions, 1)
})

test('degrades an unrelated concurrent Graphify query without queueing', async () => {
  const coordinator = new GraphifyQueryCoordinator()
  let release!: (value: string) => void
  const first = coordinator.resolve('first', () => new Promise(resolve => { release = resolve }), () => 'busy')

  assert.equal(await coordinator.resolve('second', async () => 'second-result', () => 'graphify-busy'), 'graphify-busy')
  release('first-result')
  assert.equal(await first, 'first-result')
})

test('rejects oversized graph.json from the in-process fallback', () => {
  assert.equal(isGraphJsonSafeForFallback(DEFAULT_GRAPH_JSON_FALLBACK_MAX_BYTES), true)
  assert.equal(isGraphJsonSafeForFallback(DEFAULT_GRAPH_JSON_FALLBACK_MAX_BYTES + 1), false)
})
