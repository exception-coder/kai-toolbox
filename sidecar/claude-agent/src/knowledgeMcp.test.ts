import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  CROSS_TOPOLOGY_READONLY_TOOLS,
  DOMAIN_KNOWLEDGE_READONLY_TOOLS,
  knowledgeMcpRecoveryPrompt,
  readonlyKnowledgeMcpCall,
  resolveKnowledgeMcpPaths,
  retryReadonlyKnowledgeMcp,
} from './knowledgeMcp.js'

test('uses the installed team-tools repositories instead of a legacy workspace fallback', () => {
  const homeDir = path.join('C:', 'Users', 'tester')

  const paths = resolveKnowledgeMcpPaths({
    homeDir,
    env: { KAI_WORKSPACE_ROOT: path.join('D:', 'legacy-workspace') },
  })

  const teamToolsRoot = path.join(homeDir, '.kai-toolbox', 'team-tools')
  assert.deepEqual(paths, {
    engine: path.join(teamToolsRoot, 'project-domain-knowledge', 'dist', 'server.js'),
    domainKnowledge: path.join(teamToolsRoot, 'project-domain-knowledge', 'knowledge'),
    crossTopology: path.join(teamToolsRoot, 'cross-project-topology', 'knowledge'),
  })
})

test('keeps explicit MCP path overrides for controlled deployments', () => {
  const paths = resolveKnowledgeMcpPaths({
    homeDir: path.join('C:', 'Users', 'tester'),
    env: {
      DOMAIN_KNOWLEDGE_ENGINE: path.join('X:', 'engine', 'server.js'),
      DOMAIN_KB_DIR: path.join('X:', 'domain', 'knowledge'),
      CROSS_TOPO_KB_DIR: path.join('X:', 'cross', 'knowledge'),
    },
  })

  assert.deepEqual(paths, {
    engine: path.join('X:', 'engine', 'server.js'),
    domainKnowledge: path.join('X:', 'domain', 'knowledge'),
    crossTopology: path.join('X:', 'cross', 'knowledge'),
  })
})

test('exposes the two Core Spec tools only on the domain knowledge server', () => {
  assert.deepEqual(DOMAIN_KNOWLEDGE_READONLY_TOOLS, [
    'list_projects',
    'list_modules',
    'list_topics',
    'search_knowledge',
    'locate_menu',
    'get_knowledge',
    'get_related',
    'get_module_core_spec',
    'resolve_consult_context',
  ])
  assert.deepEqual(CROSS_TOPOLOGY_READONLY_TOOLS, [
    'list_projects',
    'list_modules',
    'list_topics',
    'search_knowledge',
    'locate_menu',
    'get_knowledge',
    'get_related',
  ])
})

test('recognizes only allowlisted read-only knowledge calls for isolated recovery', () => {
  assert.deepEqual(
    readonlyKnowledgeMcpCall('domain-knowledge/get_module_core_spec', {
      project: 'kai-toolbox', module: 'reqpool', query: '状态迁移',
    }),
    {
      server: 'domain-knowledge',
      tool: 'get_module_core_spec',
      arguments: { project: 'kai-toolbox', module: 'reqpool', query: '状态迁移' },
    },
  )
  assert.equal(readonlyKnowledgeMcpCall('domain-knowledge/reload_knowledge', {}), undefined)
  assert.equal(readonlyKnowledgeMcpCall('forge/register_pending_sql', { sql: 'UPDATE t SET a=1' }), undefined)
  assert.equal(readonlyKnowledgeMcpCall('domain-knowledge/get_module_core_spec'), undefined)
})

test('isolated recovery uses the original call once and builds a continuation prompt', async () => {
  const call = readonlyKnowledgeMcpCall('mcp__domain_knowledge__get_module_core_spec', {
    project: 'kai-toolbox', module: 'reqpool', query: '状态迁移',
  })
  assert.ok(call)
  let calls = 0
  const result = await retryReadonlyKnowledgeMcp(call, {
    async call(actual, timeoutMs, signal) {
      calls += 1
      assert.deepEqual(actual, call)
      assert.equal(timeoutMs, 8_000)
      assert.equal(signal, undefined)
      return { found: false, reason: { code: 'CORE_SPEC_NOT_FOUND' } }
    },
  })

  assert.equal(calls, 1)
  const prompt = knowledgeMcpRecoveryPrompt(call, result)
  assert.match(prompt, /隔离进程中重新执行成功/)
  assert.match(prompt, /CORE_SPEC_NOT_FOUND/)
  assert.match(prompt, /不要再次调用上述工具/)
})

test('isolated recovery propagates the caller cancellation signal', async () => {
  const call = readonlyKnowledgeMcpCall('cross-topology/get_related', {
    project: 'kai-toolbox', symbol: 'ClaudeChatService',
  })
  assert.ok(call)
  const controller = new AbortController()

  await retryReadonlyKnowledgeMcp(call, {
    async call(actual, timeoutMs, signal) {
      assert.deepEqual(actual, call)
      assert.equal(timeoutMs, 8_000)
      assert.equal(signal, controller.signal)
      return { nodes: [] }
    },
  }, undefined, controller.signal)
})
