import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildCodexCapabilitySnapshot,
  parseMcpCapabilities,
  parsePluginCapabilities,
  parseSkillCapabilities,
} from './sessionCapabilities.js'

test('parses runtime MCP tools and connection metadata', () => {
  const servers = parseMcpCapabilities({ data: [{
    name: 'forge',
    runtimeStatus: 'connected',
    authStatus: 'unsupported',
    serverInfo: { title: 'Forge', version: '2.1.0' },
    tools: {
      register_pending_sql: { name: 'register_pending_sql', description: '登记 SQL' },
      prepare_sql_context: { name: 'prepare_sql_context' },
    },
  }] })

  assert.equal(servers[0]?.verified, true)
  assert.equal(servers[0]?.toolInventoryComplete, true)
  assert.equal(servers[0]?.serverVersion, '2.1.0')
  assert.deepEqual(servers[0]?.tools.map(tool => tool.name), ['prepare_sql_context', 'register_pending_sql'])
})

test('groups loaded skills by plugin id without guessing ownership', () => {
  const skills = parseSkillCapabilities({ data: [{ cwd: 'D:\\repo', errors: [], skills: [
    { name: 'team-review', description: 'Review', enabled: true, path: 'D:\\skill', scope: 'user', pluginId: 'team-standards' },
    { name: 'repo-skill', description: 'Repo', enabled: true, path: 'D:\\repo\\skill', scope: 'repo', pluginId: null },
  ] }] })

  assert.equal(skills.find(skill => skill.name === 'team-review')?.pluginId, 'team-standards')
  assert.equal(skills.find(skill => skill.name === 'repo-skill')?.pluginId, undefined)
})

test('detects installed plugin version drift and ignores catalog-only entries', () => {
  const plugins = parsePluginCapabilities({ marketplaces: [{ name: 'team', plugins: [
    { id: 'team-standards', name: 'Team Standards', installed: true, enabled: true, localVersion: '2.0.0', version: '2.1.0' },
    { id: 'not-installed', name: 'Not installed', installed: false, enabled: false, version: '1.0.0' },
  ] }] })

  assert.equal(plugins.length, 1)
  assert.equal(plugins[0]?.updateAvailable, true)
})

test('keeps configured MCP visible but explicitly unverified when runtime omitted it', () => {
  const snapshot = buildCodexCapabilitySnapshot({
    mcpResult: { data: [] },
    configuredMcpServers: [{ name: 'erp_db', status: 'configured' }],
  })

  assert.equal(snapshot.capabilitySource, 'codex-app-server')
  assert.equal(snapshot.mcpServers[0]?.verified, false)
  assert.equal(snapshot.mcpServers[0]?.tools.length, 0)
})

test('keeps Forge session and shadowed Auth-global provenance for the same MCP', () => {
  const snapshot = buildCodexCapabilitySnapshot({
    mcpResult: { data: [{
      name: 'srm_db', runtimeStatus: 'connected',
      tools: { query: { name: 'query' } },
    }] },
    configuredMcpServers: [{ name: 'srm_db', status: 'configured' }],
    authGlobalMcpServerNames: ['srm_db'],
  })

  const server = snapshot.mcpServers[0]
  assert.deepEqual(server?.provenance.map(source => [source.origin, source.effective]), [
    ['forge-session', true],
    ['engine-auth-global', false],
  ])
  assert.deepEqual(server?.tools[0]?.provenance.map(source => source.origin), ['forge-session'])
})

test('classifies plugin, project, Auth-global and engine skills from official ownership fields', () => {
  const skills = parseSkillCapabilities({ data: [{ skills: [
    { name: 'plugin-skill', scope: 'user', pluginId: 'team-standards', enabled: true },
    { name: 'project-skill', scope: 'repo', enabled: true },
    { name: 'user-skill', scope: 'user', enabled: true },
    { name: 'builtin-skill', scope: 'system', enabled: true },
  ] }] })

  assert.equal(skills.find(skill => skill.name === 'plugin-skill')?.provenance[0]?.origin, 'plugin')
  assert.equal(skills.find(skill => skill.name === 'project-skill')?.provenance[0]?.origin, 'project-local')
  assert.equal(skills.find(skill => skill.name === 'user-skill')?.provenance[0]?.origin, 'engine-auth-global')
  assert.equal(skills.find(skill => skill.name === 'builtin-skill')?.provenance[0]?.origin, 'engine-builtin')
})

test('keeps Auth-global configured MCP visible when no thread runtime is available', () => {
  const snapshot = buildCodexCapabilitySnapshot({
    skillsResult: { data: [] },
    configuredMcpServers: [],
    authGlobalMcpServerNames: ['github'],
  })

  assert.equal(snapshot.mcpServers[0]?.name, 'github')
  assert.equal(snapshot.mcpServers[0]?.verified, false)
  assert.equal(snapshot.mcpServers[0]?.provenance[0]?.origin, 'engine-auth-global')
  assert.equal(snapshot.mcpServers[0]?.provenance[0]?.evidence, 'configuration')
})

test('reports the actual managed continuous execution skill version and content fingerprint', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-skill-'))
  const path = join(directory, 'SKILL.md')
  const content = '---\nname: forge-openspec-continuous-execution\nx-forge-version: 1.0.0\n---\n'
  writeFileSync(path, content)
  try {
    const skills = parseSkillCapabilities({ data: [{ skills: [{
      name: 'forge-openspec-continuous-execution', enabled: true, path, scope: 'repo',
    }] }] })

    assert.equal(skills[0]?.version, '1.0.0')
    assert.equal(skills[0]?.contentFingerprint, createHash('sha256').update(content).digest('hex'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('does not invent a continuous execution skill and reports a loaded version mismatch verbatim', () => {
  assert.equal(parseSkillCapabilities({ data: [{ skills: [] }] })
    .some(skill => skill.name === 'forge-openspec-continuous-execution'), false)

  const directory = mkdtempSync(join(tmpdir(), 'forge-skill-old-'))
  const path = join(directory, 'SKILL.md')
  writeFileSync(path, '---\nname: forge-openspec-continuous-execution\nx-forge-version: 0.9.0\n---\n')
  try {
    const skill = parseSkillCapabilities({ data: [{ skills: [{
      name: 'forge-openspec-continuous-execution', enabled: true, path, scope: 'repo',
    }] }] }).find(candidate => candidate.name === 'forge-openspec-continuous-execution')
    assert.equal(skill?.version, '0.9.0')
    assert.equal(skill?.enabled, true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
