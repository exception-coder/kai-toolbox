import assert from 'node:assert/strict'
import test from 'node:test'
import { standardToolboxMcpRequirements } from './codexMcpPolicy.js'

test('ordinary coding exposes only the unified Forge MCP server', () => {
  assert.deepEqual(standardToolboxMcpRequirements('session-1', true), [{ name: 'forge', required: true }])
})

test('one-shot has no Forge while a persisted session keeps dynamic resources independent of SQL registration', () => {
  assert.equal(standardToolboxMcpRequirements(undefined, true).some(item => item.name === 'forge'), false)
  assert.equal(standardToolboxMcpRequirements('session-1', false).some(item => item.name === 'forge'), true)
})
