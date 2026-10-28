import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexMcpStartupWarnings } from './codexMcpStartupWarnings.js'

test('summarizes the reported challenge without leaking transport payloads', () => {
  const warnings = new CodexMcpStartupWarnings()
  const result = warnings.accept({ name: 'openaiDeveloperDocs', status: 'failed',
    threadId: 'private-thread', error: 'HTTP 403 {"code":"challenge","id":"request-1","token":"secret"}' })
  assert.equal(result?.reason, 'challenge')
  assert.match(result!.message, /验证挑战/)
  assert.match(result!.message, /本轮无法使用该工具/)
  assert.doesNotMatch(result!.message, /private-thread|request-1|secret|Transport|\{/)
  assert.ok(result!.message.length < 180)
})

test('coalesces retries with different request IDs but keeps independent tools and failures', () => {
  const warnings = new CodexMcpStartupWarnings()
  const failure = { name: 'docs', status: 'failed', error: 'HTTP 403 challenge request-1' }
  assert.ok(warnings.accept(failure))
  assert.equal(warnings.accept({ ...failure, error: 'HTTP 403 challenge request-2' }), undefined)
  assert.ok(warnings.accept({ ...failure, name: 'other' }))
  assert.ok(warnings.accept({ ...failure, error: 'connection timeout' }))
})

test('only confirmed recovery resets suppression; another turn has independent state', () => {
  const warnings = new CodexMcpStartupWarnings()
  const failure = { name: 'docs', status: 'failed' }
  assert.ok(warnings.accept(failure))
  assert.equal(warnings.accept({ name: 'docs', status: 'starting' }), undefined)
  assert.equal(warnings.accept(failure), undefined)
  assert.equal(warnings.accept({ name: 'docs', status: 'ready' }), undefined)
  assert.ok(warnings.accept(failure))
  assert.ok(new CodexMcpStartupWarnings().accept(failure))
})

test('supports nested status and error objects without serializing unknown data', () => {
  const warnings = new CodexMcpStartupWarnings()
  assert.equal(warnings.accept({ status: { name: 'docs', state: 'failed', error: { message: 'HTTP 403' } } })?.reason, 'forbidden')
  assert.equal(warnings.accept({ name: 'other', status: { status: 'failed' }, error: 'timeout' })?.reason, 'timeout')
  assert.equal(warnings.accept({ name: 'unknown', status: 'failed', error: { token: 'secret' } })?.reason, 'unavailable')
  assert.equal(warnings.accept({ name: 'cancelled', status: 'cancelled' }), undefined)
})
