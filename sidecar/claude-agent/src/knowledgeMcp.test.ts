import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  CROSS_TOPOLOGY_READONLY_TOOLS,
  DOMAIN_KNOWLEDGE_READONLY_TOOLS,
  resolveKnowledgeMcpPaths,
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
