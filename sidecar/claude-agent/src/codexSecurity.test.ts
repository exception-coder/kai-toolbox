import assert from 'node:assert/strict'
import test from 'node:test'
import {
  consultReadonlyCodexConfig,
  consultReadonlyRequiredMcpTools,
  resolveConsultTargetSystem,
} from './codexSecurity.js'

test('resolves the consultation database target from the registered source directory', () => {
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\srm-system'), 'srm')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\scm-system'), 'scm')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\Yoooni'), 'erp')
  assert.equal(resolveConsultTargetSystem('D:\\Users\\zhang\\myWork\\unknown-system'), undefined)
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
