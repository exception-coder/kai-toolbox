import assert from 'node:assert/strict'
import test from 'node:test'
import { queryKnowledge, knowledgeQueryTool } from './knowledgeQuery.js'
import type { ReadonlyKnowledgeMcpCall } from './knowledgeMcp.js'
import { Permissions } from './permissions.js'

test('unified queries preserve source, payload, candidate revision and independent failure', async () => {
  const calls: ReadonlyKnowledgeMcpCall[] = []
  const result = await queryKnowledge({ source: 'all', action: 'search_knowledge', arguments: { project: 'erp', query: '订单' } }, {
    call: async call => {
      calls.push(call)
      if (call.server === 'cross-topology') throw new Error('offline secret detail')
      return { content: [{ type: 'text', text: '{"reviewState":"STALE","revision":4}' }] }
    },
  })
  assert.deepEqual(calls.map(call => call.server), ['domain-knowledge', 'cross-topology'])
  assert.deepEqual(calls[0].arguments, { project: 'erp', query: '订单' })
  assert.equal(result.results[0].status, 'OK')
  assert.match(JSON.stringify(result.results[0]), /STALE/)
  assert.equal(result.results[1].status, 'UNAVAILABLE')
  assert.doesNotMatch(JSON.stringify(result), /secret/)
})

test('mutations and invalid input are refused before dispatch', async () => {
  let calls = 0
  const runtime = { call: async () => { calls++; return {} } }
  for (const input of [
    { source: 'domain', action: 'reload_knowledge', arguments: {} },
    { source: 'outside', action: 'list_projects', arguments: {} },
    { source: 'domain', action: 'list_projects', arguments: [] },
    { source: 'domain', action: 'list_projects', arguments: { text: 'x'.repeat(16001) } },
  ]) await assert.rejects(queryKnowledge(input, runtime))
  assert.equal(calls, 0)
  assert.equal(knowledgeQueryTool.annotations.readOnlyHint, true)
})

test('domain-only candidate actions use original engine and topology is explicit unsupported', async () => {
  let calls = 0
  const result = await queryKnowledge({ source: 'all', action: 'get_spec_candidate', arguments: { id: 'candidate' } }, {
    call: async call => { calls++; assert.equal(call.server, 'domain-knowledge'); return { revision: 3, review: 'stale' } },
  })
  assert.equal(calls, 1)
  assert.equal(result.results[1].status, 'UNSUPPORTED')
  assert.match(JSON.stringify(result.results[0]), /stale/)
})

test('engine error and truncation cannot masquerade as complete knowledge', async () => {
  const result = await queryKnowledge({ source: 'domain', action: 'list_projects', arguments: {} }, {
    call: async () => ({ isError: true, content: 'x'.repeat(33000) }),
  })
  assert.equal(result.results[0].status, 'ERROR')
  assert.equal('truncated' in result.results[0] && result.results[0].truncated, true)
})

test('Claude readonly permission admits the facade while retaining command denial', async () => {
  const permissions = new Permissions(() => { throw new Error('Unexpected approval prompt') })
  permissions.setToolPolicy('consult-readonly')
  assert.equal((await permissions.canUseTool('mcp__consult-readonly__knowledge_query', { source: 'domain', action: 'list_projects', arguments: {} }, {})).behavior, 'allow')
  assert.equal((await permissions.canUseTool('Bash', { command: 'echo forbidden' }, {})).behavior, 'deny')
})
