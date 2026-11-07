import assert from 'node:assert/strict'
import test from 'node:test'
import { queryKnowledge, knowledgeQueryTool } from './knowledgeQuery.js'
import { Permissions } from './permissions.js'

test('legacy topology requests retire explicitly and new schema advertises only project files', async () => {
  const result = await queryKnowledge({ source: 'all', action: 'search_knowledge', arguments: {} })
  assert.equal(result.results[0].status, 'UNAVAILABLE')
  assert.equal(result.results[1].status, 'RETIRED')
  const retired = await queryKnowledge({ source: 'topology', action: 'get_related', arguments: {} })
  assert.equal(retired.results[0].status, 'RETIRED')
  assert.deepEqual(knowledgeQueryTool.inputSchema.properties.source.enum, ['domain'])
})

test('mutations and invalid input are refused before dispatch', async () => {
  for (const input of [
    { source: 'domain', action: 'reload_knowledge', arguments: {} },
    { source: 'outside', action: 'list_projects', arguments: {} },
    { source: 'domain', action: 'list_projects', arguments: [] },
    { source: 'domain', action: 'list_projects', arguments: { text: 'x'.repeat(16001) } },
  ]) await assert.rejects(queryKnowledge(input))
  assert.equal(knowledgeQueryTool.annotations.readOnlyHint, true)
})

test('retired domain requests never call the old engine', async () => {
  const result = await queryKnowledge({ source: 'domain', action: 'get_spec_candidate', arguments: { id: 'candidate' } })
  assert.equal(result.results[0].status, 'UNAVAILABLE')
})

test('Claude readonly permission admits the facade while retaining command denial', async () => {
  const permissions = new Permissions(() => { throw new Error('Unexpected approval prompt') })
  permissions.setToolPolicy('consult-readonly')
  assert.equal((await permissions.canUseTool('mcp__consult-readonly__knowledge_query', { source: 'domain', action: 'list_projects', arguments: {} }, {})).behavior, 'allow')
  assert.equal((await permissions.canUseTool('mcp__domain-knowledge__search_knowledge', {}, {})).behavior, 'deny')
  assert.equal((await permissions.canUseTool('mcp__cross-topology__search_knowledge', {}, {})).behavior, 'deny')
  assert.equal((await permissions.canUseTool('Bash', { command: 'echo forbidden' }, {})).behavior, 'deny')
})
