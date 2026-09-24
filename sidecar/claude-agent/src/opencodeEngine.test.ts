import assert from 'node:assert/strict'
import test from 'node:test'
import { missingAssistantText } from './opencodeEngine.js'

test('OpenCode prompt response recovers text when SSE was missed', () => {
  assert.equal(missingAssistantText('完整回答', '', false), '完整回答')
})

test('OpenCode prompt response only appends the part missing from SSE', () => {
  assert.equal(missingAssistantText('完整回答', '完整', true), '回答')
  assert.equal(missingAssistantText('完整回答', '完整回答', true), '')
})

test('OpenCode prompt response does not duplicate divergent streamed text', () => {
  assert.equal(missingAssistantText('新文本', '旧文本', true), '')
})
