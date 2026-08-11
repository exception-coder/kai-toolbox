import assert from 'node:assert/strict'
import test from 'node:test'
import {
  consultReadonlyCodexConfig,
  consultReadonlyRequiredMcpTools,
  resolveConsultTargetSystem,
  resolveConsultTargetSystems,
} from './codexSecurity.js'

test('resolves the consultation database target from the registered source directory', () => {
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\srm-system'), 'srm')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\scm-system'), 'scm')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\Yoooni'), 'erp')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\unknown-system'), undefined)
})

test('adds only confirmed evidence systems to the selected consultation system', () => {
  assert.deepEqual(resolveConsultTargetSystems('D:\\work\\srm-system', ['ERP', 'unknown', 'erp']), ['srm', 'erp'])
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\srm-system', ['erp']), [
    { server: 'consult-readonly', tool: 'srm_db_query' },
    { server: 'consult-readonly', tool: 'erp_db_query' },
  ])
})

test('requires the database tool that belongs to the selected consultation system', () => {
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\srm-system'), [
    { server: 'consult-readonly', tool: 'srm_db_query' },
  ])
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\Yoooni'), [
    { server: 'consult-readonly', tool: 'erp_db_query' },
  ])
  assert.deepEqual(consultReadonlyRequiredMcpTools('D:\\work\\unknown-system'), [])
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
