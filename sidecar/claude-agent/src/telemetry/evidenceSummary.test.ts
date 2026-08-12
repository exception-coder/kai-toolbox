import assert from 'node:assert/strict'
import test from 'node:test'
import { evidenceAttributes, summarizeToolEvidence } from './evidenceSummary.js'

test('summarizes database evidence without exposing SQL or parameters', () => {
  const summary = summarizeToolEvidence(
    'mcp__consult-readonly__srm_db_query',
    { sql: "select * from orders where supplier_id = 918 and password='secret'" },
    { rows: [{ supplier_id: 1 }, { supplier_id: 2 }] },
  )
  const attributes = evidenceAttributes(summary)
  assert.equal(summary.sourceType, 'database')
  assert.equal(summary.system, 'srm')
  assert.equal(summary.operation, 'select')
  assert.equal(summary.resultCount, 2)
  assert.match(String(summary.queryFingerprint), /^sha256:[a-f0-9]{24}$/)
  assert.equal(JSON.stringify(attributes).includes('supplier_id = 918'), false)
  assert.equal(JSON.stringify(attributes).includes('secret'), false)
})

test('summarizes graph and domain knowledge evidence ids', () => {
  const graph = summarizeToolEvidence('mcp__consult-readonly__source_context', { query: '采购订单' }, {
    nodes: [{ nodeId: 'OrderService' }, { nodeId: 'OrderMapper' }],
  })
  assert.equal(graph.sourceType, 'graph')
  assert.deepEqual(graph.evidenceIds, ['OrderService', 'OrderMapper'])

  const knowledge = summarizeToolEvidence('mcp__domain-knowledge__search_knowledge', { module: '采购管理' }, {
    results: [{ chunkId: 'purchase-order-rule' }], evidenceLevel: 'L2',
  })
  assert.equal(knowledge.sourceType, 'domain_knowledge')
  assert.deepEqual(knowledge.modules, ['采购管理'])
  assert.equal(knowledge.evidenceLevel, 'L2')
})

test('never exports an absolute source path as an evidence id', () => {
  const summary = summarizeToolEvidence('mcp__consult-readonly__source_read', { path: 'D:\\work\\Yoooni\\src\\Order.java' }, {
    items: [{ id: 'D:\\work\\Yoooni\\src\\Order.java' }],
  })
  assert.equal(summary.sourceType, 'source_code')
  assert.match(summary.evidenceIds?.[0] ?? '', /^path:sha256:[a-f0-9]{24}$/)
  assert.equal(JSON.stringify(summary).includes('D:\\work'), false)
})
