import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProjectKnowledge } from './projectKnowledge.js'
import { queryKnowledge } from './knowledgeQuery.js'
import { createDomainKnowledgeServer, createCodexDomainKnowledgeServer } from './knowledgeMcp.js'

test('project citations are fresh, isolated and do not require any central repository', async () => {
  const root = mkdtempSync(join(tmpdir(), 'forge-project-knowledge-'))
  try {
    mkdirSync(join(root, 'docs/domain'), { recursive: true })
    writeFileSync(join(root, 'docs/domain/order.md'), '# Order\nconfirmed: false\n旧条件')
    const result = await readProjectKnowledge(root, 'search_knowledge', { query: '旧条件' })
    assert.equal(result.status, 'OK')
    assert.equal(result.results[0].path, 'docs/domain/order.md')
    assert.match(result.results[0].content, /confirmed: false/)
    writeFileSync(join(root, 'docs/domain/order.md'), '# Order\n新条件')
    assert.match((await readProjectKnowledge(root, 'get_knowledge', { path: 'docs/domain/order.md' })).results[0].content, /新条件/)
    assert.equal((await readProjectKnowledge(root, 'get_knowledge', { path: '../other/docs/domain/order.md' })).status, 'NO_EVIDENCE')
    await assert.rejects(readProjectKnowledge(root, 'search_knowledge', { project: 'other' }))
    await assert.rejects(readProjectKnowledge(root, 'search_knowledge', {}, async () => { throw Error('excluded path') }), /excluded path/)
    let calls = 0
    const all = await queryKnowledge({ source: 'all', action: 'search_knowledge', arguments: { query: '新条件' } },
      { call: async call => { calls++; assert.equal(call.server, 'cross-topology'); throw Error('offline') } }, root)
    assert.equal(all.results[0].status, 'OK')
    assert.equal(all.results[1].status, 'UNAVAILABLE')
    assert.equal(calls, 1)
    assert.equal((await readProjectKnowledge(root, 'search_knowledge', { query: 'missing' })).status, 'NO_EVIDENCE')
    assert.equal(createDomainKnowledgeServer(), null)
    assert.equal(createCodexDomainKnowledgeServer(), null)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
