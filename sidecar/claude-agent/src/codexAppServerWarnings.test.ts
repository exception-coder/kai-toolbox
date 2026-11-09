import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexAppServerWarnings, codexWarningMessage } from './codexAppServerWarnings.js'

test('renders native configWarning summary rather than its raw JSON envelope', () => {
  assert.equal(codexWarningMessage({ summary: 'Unknown setting: mcp_servers.node_repl.type', details: null }),
    'Unknown setting: mcp_servers.node_repl.type')
})

test('coalesces native and legacy copies even if whitespace differs', () => {
  const warnings = new CodexAppServerWarnings()
  assert.equal(warnings.accept({ summary: 'Unknown setting.\n user: node_repl.type', details: null }),
    'Unknown setting.\n user: node_repl.type')
  assert.equal(warnings.accept({ message: 'Unknown setting. user: node_repl.type' }), undefined)
  assert.equal(warnings.accept({ reason: 'Unknown setting.  user: node_repl.type' }), undefined)
})

test('preserves distinct warnings, readable details and independent turns', () => {
  const warnings = new CodexAppServerWarnings()
  assert.equal(warnings.accept({ summary: 'Configuration warning', details: 'first field' }), 'Configuration warning\nfirst field')
  assert.equal(warnings.accept({ summary: 'Configuration warning', details: 'second field' }), 'Configuration warning\nsecond field')
  assert.equal(new CodexAppServerWarnings().accept({ summary: 'Configuration warning', details: 'first field' }), 'Configuration warning\nfirst field')
})

test('supports message/reason but does not serialize arbitrary or nested diagnostic payloads', () => {
  assert.equal(codexWarningMessage({ message: 'legacy warning' }), 'legacy warning')
  assert.equal(codexWarningMessage({ reason: 'legacy reason' }), 'legacy reason')
  assert.equal(codexWarningMessage({ summary: 'safe explanation', details: { token: 'secret' } }), 'safe explanation')
  assert.doesNotMatch(codexWarningMessage({ token: 'secret', requestId: 'private' }), /secret|private|\{/)
  assert.equal(codexWarningMessage({ summary: ' ' , message: 'fallback', details: '' }), 'fallback')
  assert.equal(codexWarningMessage({ summary: 'warning with detail', details: 'detail' }), 'warning with detail')
})
