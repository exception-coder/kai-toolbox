import assert from 'node:assert/strict'
import test from 'node:test'
import { standardToolboxMcpRequirements } from './codexMcpPolicy.js'

test('ordinary coding keeps business-system MCP servers optional', () => {
  assert.deepEqual(standardToolboxMcpRequirements('session-1', true), [
    { name: 'forge', required: true },
    { name: 'erp_db', required: false },
    { name: 'erp_app', required: false },
    { name: 'srm_db', required: false },
    { name: 'srm_app', required: false },
    { name: 'scm_db', required: false },
  ])
})

test('one-shot or disabled SQL registration does not expose forge', () => {
  assert.equal(standardToolboxMcpRequirements(undefined, true).some(item => item.name === 'forge'), false)
  assert.equal(standardToolboxMcpRequirements('session-1', false).some(item => item.name === 'forge'), false)
})
