import assert from 'node:assert/strict'
import test from 'node:test'
import { standardToolboxMcpRequirements } from './codexMcpPolicy.js'
import { standardToolboxMcpConfig } from './codexEngine.js'

test('ordinary coding exposes only the unified Forge MCP server', () => {
  assert.deepEqual(standardToolboxMcpRequirements('session-1', true), [{ name: 'forge', required: true }])
})

test('ordinary Codex Forge MCP allows a bounded verification call', () => {
  const previous = process.env.TOOLBOX_API_BASE
  process.env.TOOLBOX_API_BASE = 'http://127.0.0.1:18080'
  try {
    const config = standardToolboxMcpConfig('session-1')
    assert.equal((config.mcp_servers as Record<string, Record<string, unknown>>).forge.tool_timeout_sec, 300)
  } finally {
    if (previous == null) delete process.env.TOOLBOX_API_BASE
    else process.env.TOOLBOX_API_BASE = previous
  }
})

test('one-shot has no Forge while a persisted session keeps dynamic resources independent of SQL registration', () => {
  assert.equal(standardToolboxMcpRequirements(undefined, true).some(item => item.name === 'forge'), false)
  assert.equal(standardToolboxMcpRequirements('session-1', false).some(item => item.name === 'forge'), true)
})
