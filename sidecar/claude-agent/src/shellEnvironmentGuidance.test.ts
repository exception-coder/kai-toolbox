import assert from 'node:assert/strict'
import test from 'node:test'
import { appendShellEnvironmentGuidance } from './shellEnvironmentGuidance.js'
import { windowsExecutionInstructions } from './windowsExecution.js'

const context = { cwd: 'D:\\work\\项目', engine: 'codex', toolPolicy: 'default', demo: false }

test('disabled experiment preserves original instructions byte for byte', () => {
  assert.equal(appendShellEnvironmentGuidance('original\n', context, false), 'original\n')
  assert.equal(appendShellEnvironmentGuidance(undefined, context, false), undefined)
})

test('restricted and demo sessions do not receive execution guidance', () => {
  for (const toolPolicy of ['disabled', 'review-only', 'consult-readonly']) {
    assert.equal(appendShellEnvironmentGuidance('policy', { ...context, toolPolicy }, true), 'policy')
  }
  assert.equal(appendShellEnvironmentGuidance('policy', { ...context, demo: true }, true), 'policy')
})

test('Windows host does not become an assertion about the native shell', () => {
  const result = appendShellEnvironmentGuidance('keep permissions', context, true, 'win32')!
  assert.ok(result.startsWith('keep permissions\n\n'))
  assert.ok(result.includes(JSON.stringify(context.cwd)))
  assert.ok(result.includes('Execution shell type/version: not reported to Forge'))
  assert.ok(result.includes('current Harness tool schema'))
  assert.ok(!result.includes('primary shell is PowerShell 7'))
  assert.ok(!windowsExecutionInstructions()?.includes('primary shell is PowerShell 7'))
})

test('non-Windows environments retain their actual host identity', () => {
  const result = appendShellEnvironmentGuidance(undefined, { ...context, cwd: '/work', engine: 'claude' }, true, 'linux')!
  assert.ok(result.includes('Forge host OS: "linux"'))
  assert.ok(result.includes('Harness: "claude"'))
})
