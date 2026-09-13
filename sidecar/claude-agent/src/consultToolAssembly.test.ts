import test from 'node:test'
import assert from 'node:assert/strict'
import { assemblyAllowsTool, filterClaudeAssembly, filterCodexAssembly, parseConsultToolAssembly } from './consultToolAssembly.js'
import { Permissions } from './permissions.js'

const assembly = { tools: ['source_read', 'scm_db_query'], mcpServers: ['consult-readonly'] }

test('configured capabilities intersect actual system tools and disable unrelated MCP', () => {
  const config = { mcp_servers: {
    'consult-readonly': { enabled: true, enabled_tools: ['source_read', 'source_search', 'erp_db_query'] },
    'domain-knowledge': { enabled: true },
    rogue: { enabled: false },
  } }
  filterCodexAssembly(config, assembly)
  assert.deepEqual(config.mcp_servers['consult-readonly'].enabled_tools, ['source_read'])
  assert.equal(config.mcp_servers['domain-knowledge'].enabled, false)
  assert.equal(config.mcp_servers.rogue.enabled, false)
})

test('Claude filters database providers and passes exact tool restriction into stdio', () => {
  const servers: Record<string, Record<string, unknown>> = {
    scm_db: {}, erp_db: {}, 'domain-knowledge': {}, 'consult-readonly': { env: { TOOLBOX_SOURCE_ROOT: '/source' } },
  }
  filterClaudeAssembly(servers, assembly)
  assert.deepEqual(Object.keys(servers).sort(), ['consult-readonly', 'scm_db'])
  assert.equal((servers['consult-readonly'].env as Record<string, string>).CONSULT_ENABLED_TOOLS, JSON.stringify(assembly.tools))
  assert.equal(assemblyAllowsTool(assembly, 'mcp__scm_db__query'), true)
  assert.equal(assemblyAllowsTool(assembly, 'mcp__consult-readonly__source_read'), true)
  assert.equal(assemblyAllowsTool(assembly, 'mcp__consult-readonly__source_search'), false)
  assert.equal(assemblyAllowsTool(assembly, 'Read'), false)
})

test('malformed assembly fails closed, absent assembly preserves legacy behavior', () => {
  assert.throws(() => parseConsultToolAssembly({ tools: ['x;command'], mcpServers: [] }))
  assert.equal(parseConsultToolAssembly(undefined), undefined)
  assert.equal(assemblyAllowsTool(undefined, 'Read'), true)
})

test('permission broker denies unbound tools despite auto approval', async () => {
  const broker = new Permissions(() => {})
  broker.setToolPolicy('consult-readonly')
  broker.setAutoApprove(true)
  broker.consultToolAssembly = assembly
  assert.equal((await broker.canUseTool('mcp__consult-readonly__source_search', {}, {})).behavior, 'deny')
  assert.equal((await broker.canUseTool('mcp__scm_db__query', {}, {})).behavior, 'allow')
})
