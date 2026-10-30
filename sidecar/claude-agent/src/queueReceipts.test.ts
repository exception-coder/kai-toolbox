import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QueueReceipts, queueCheckOutcome } from './queueReceipts.js'

test('durable receipts deduplicate input, retain model conclusion and change epoch after pruning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'forge-queue-'))
  try {
    const file = join(dir, 'receipts.json')
    let receipts = new QueueReceipts(file, 2)
    const epoch = receipts.storeId
    receipts.receive('s', 't1')
    receipts = new QueueReceipts(file, 2)
    assert.equal(receipts.find('s', 't1')?.state, 'RECEIVED')
    receipts.complete('s', { turnId: 't1', stopReason: 'end_turn', queueCheckOutcome: 'COMPLETED' })
    assert.equal(receipts.receive('s', 't1').state, 'COMPLETED')
    assert.equal(new QueueReceipts(file).find('s', 't1')?.queueCheckOutcome, 'COMPLETED')
    receipts.receive('s', 't2'); receipts.receive('s', 't3')
    assert.notEqual(receipts.storeId, epoch)
    assert.equal(receipts.find('s', 't1'), undefined)
    assert.throws(() => receipts.receive('s', 't4'), /未收口/)
    assert.equal(receipts.find('s', 't4'), undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('only an explicit current-round completion answer releases the queue', () => {
  assert.equal(queueCheckOutcome('已完成并核对结果\nFORGE_QUEUE_COMPLETED:t1', 't1'), 'COMPLETED')
  assert.equal(queueCheckOutcome('FORGE_QUEUE_COMPLETED:old', 't1'), 'UNCONFIRMED')
  assert.equal(queueCheckOutcome('FORGE_QUEUE_COMPLETED:t1\n但仍有未完成项', 't1'), 'UNCONFIRMED')
  assert.equal(queueCheckOutcome('没有完成', 't1'), 'UNCONFIRMED')
})
