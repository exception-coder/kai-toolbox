import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QueueReceipts, applyTaskCompletionReceipt, queueCheckOutcome } from './queueReceipts.js'

test('the original turn receipt distinguishes completed work, partial work and user decisions', () => {
  const terminal = { stopReason: 'end_turn', queueReleaseSafe: true }
  for (const outcome of ['answered', 'completed']) {
    assert.equal(applyTaskCompletionReceipt(`结果\n<!-- forge-task:${outcome} -->`, terminal), terminal)
  }
  assert.deepEqual(applyTaskCompletionReceipt('还有一项未做\n<!-- forge-task:incomplete -->', terminal),
    { stopReason: 'task_incomplete', queueReleaseSafe: false })
  assert.deepEqual(applyTaskCompletionReceipt('请确认方案\n<!-- forge-task:confirmation_required -->', terminal),
    { stopReason: 'task_confirmation_required', queueReleaseSafe: false })
  assert.equal(applyTaskCompletionReceipt('这个问题已有统一规则，直接复用即可。', terminal), terminal)
  assert.equal(applyTaskCompletionReceipt('<!-- forge-task:confirmation_required -->\n这是格式示例。', terminal), terminal)
  const unsafe = { stopReason: 'end_turn', queueReleaseSafe: false }
  assert.equal(applyTaskCompletionReceipt('<!-- forge-task:completed -->', unsafe), unsafe)
  const unknown = { stopReason: 'outcome_unknown', queueReleaseSafe: false }
  assert.equal(applyTaskCompletionReceipt('<!-- forge-task:completed -->', unknown), unknown)
})

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
