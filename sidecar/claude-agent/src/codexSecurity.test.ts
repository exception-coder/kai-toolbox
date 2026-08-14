import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CONSULT_READONLY_PROMPT,
  REVIEW_ONLY_PROMPT,
  consultReadonlyCodexConfig,
  consultReadonlyRequiredMcpTools,
  reviewOnlyCodexConfig,
  resolveConsultTargetSystem,
  resolveConsultTargetSystems,
} from './codexSecurity.js'

test('review prompt explicitly forbids implementation side effects', () => {
  assert.match(REVIEW_ONLY_PROMPT, /禁止修改文件、执行命令、提交代码、写数据库/)
  assert.match(REVIEW_ONLY_PROMPT, /回到原开发会话执行/)
})

test('review config closes apps, plugins, code mode and every configured MCP', () => {
  const home = mkdtempSync(join(tmpdir(), 'review-codex-home-'))
  try {
    writeFileSync(join(home, 'config.toml'), '[mcp_servers.forge]\ncommand = "node"\n[mcp_servers.external-writer]\ncommand = "node"\n')
    const config = reviewOnlyCodexConfig(home)
    const features = config.features as Record<string, unknown>
    assert.equal(features.apps, false)
    assert.equal(features.plugins, false)
    assert.equal(features.code_mode, false)
    assert.equal(features.code_mode_host, false)
    assert.equal(features.multi_agent, false)
    assert.deepEqual(config.mcp_servers, {
      forge: { enabled: false },
      'external-writer': { enabled: false },
    })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('resolves the consultation database target from the registered source directory', () => {
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\srm-system'), 'srm')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\scm-system'), 'scm')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\Yoooni'), 'erp')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\unknown-system'), undefined)
})

test('adds only confirmed evidence systems to the selected consultation system', () => {
  assert.deepEqual(resolveConsultTargetSystems('D:\\work\\srm-system', ['ERP', 'unknown', 'erp']), ['srm', 'erp'])
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\srm-system', ['erp']), [
    { server: 'domain-knowledge', tool: 'get_module_core_spec' },
    { server: 'domain-knowledge', tool: 'resolve_consult_context' },
    { server: 'consult-readonly', tool: 'srm_db_query' },
    { server: 'consult-readonly', tool: 'erp_db_query' },
  ])
})

test('requires Core Spec tools and the database tool for the selected consultation system', () => {
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\srm-system'), [
    { server: 'domain-knowledge', tool: 'get_module_core_spec' },
    { server: 'domain-knowledge', tool: 'resolve_consult_context' },
    { server: 'consult-readonly', tool: 'srm_db_query' },
  ])
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\Yoooni'), [
    { server: 'domain-knowledge', tool: 'get_module_core_spec' },
    { server: 'domain-knowledge', tool: 'resolve_consult_context' },
    { server: 'consult-readonly', tool: 'erp_db_query' },
  ])
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\unknown-system'), [
    { server: 'domain-knowledge', tool: 'get_module_core_spec' },
    { server: 'domain-knowledge', tool: 'resolve_consult_context' },
  ])
})

test('prioritizes domain context before reading implementation evidence', () => {
  assert.match(CONSULT_READONLY_PROMPT, /领域语义优先查询 domain-knowledge/)
  assert.match(CONSULT_READONLY_PROMPT, /domain-knowledge\.resolve_consult_context/)
  assert.doesNotMatch(CONSULT_READONLY_PROMPT, /必须先调用 consult-readonly\.source_context，再调用业务知识工具/)
})

test('exposes the selected and confirmed authority database tools together', () => {
  const previousApiBase = process.env.TOOLBOX_API_BASE
  process.env.TOOLBOX_API_BASE = 'http://127.0.0.1:18080'
  try {
    const config = consultReadonlyCodexConfig(undefined, undefined, 'D:\\work\\srm-system', ['erp'])
    const servers = config.mcp_servers as Record<string, Record<string, unknown>>
    assert.deepEqual(servers['consult-readonly'].enabled_tools, [
      'srm_db_query',
      'erp_db_query',
      'erp_standby_schema_search',
      'erp_standby_validate_sql',
    ])
  } finally {
    if (previousApiBase == null) delete process.env.TOOLBOX_API_BASE
    else process.env.TOOLBOX_API_BASE = previousApiBase
  }
})

test('exposes only the selected system database tool through the code-mode host', () => {
  const previousApiBase = process.env.TOOLBOX_API_BASE
  process.env.TOOLBOX_API_BASE = 'http://127.0.0.1:18080'
  try {
    const config = consultReadonlyCodexConfig(undefined, undefined, 'D:\\work\\srm-system')
    const features = config.features as Record<string, unknown>
    const servers = config.mcp_servers as Record<string, Record<string, unknown>>
    const readonly = servers['consult-readonly']

    assert.equal(features.code_mode_host, true)
    assert.deepEqual(readonly.enabled_tools, ['srm_db_query'])
  } finally {
    if (previousApiBase == null) delete process.env.TOOLBOX_API_BASE
    else process.env.TOOLBOX_API_BASE = previousApiBase
  }
})
