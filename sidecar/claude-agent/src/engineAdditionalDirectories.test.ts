import assert from 'node:assert/strict'
import test from 'node:test'
import { codexAdditionalDirectories, withCodexWritableRoots } from './codexEngine.js'
import { qwenIncludeDirectories } from './qwenEngine.js'

test('Codex maps linked project directories to native writable roots in default sessions only', () => {
  assert.deepEqual(codexAdditionalDirectories({ additionalDirectories: [' D:/dep ', 'D:/dep', ''] }), ['D:/dep'])
  assert.deepEqual(codexAdditionalDirectories({ toolPolicy: 'review-only', additionalDirectories: ['D:/dep'] }), [])
  const config = withCodexWritableRoots({ model_reasoning_effort: 'high' }, { additionalDirectories: ['D:/dep'] })
  assert.deepEqual(config, { model_reasoning_effort: 'high', sandbox_workspace_write: { writable_roots: ['D:/dep'] } })
  const base = { model_reasoning_effort: 'high' }
  assert.equal(withCodexWritableRoots(base, {}), base)
})

test('Qwen maps linked project directories to includeDirectories in default sessions only', () => {
  assert.deepEqual(qwenIncludeDirectories({ additionalDirectories: ['D:/dep', 'D:/dep '] }), ['D:/dep'])
  assert.deepEqual(qwenIncludeDirectories({ toolPolicy: 'consult-readonly', additionalDirectories: ['D:/dep'] }), [])
})
