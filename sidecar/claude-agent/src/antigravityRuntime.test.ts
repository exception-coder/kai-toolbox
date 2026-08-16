import assert from 'node:assert/strict'
import test from 'node:test'
import { listAntigravityModels, probeAntigravityRuntime, resolveAntigravityExecutable } from './antigravityRuntime.js'

test('runtime path honors the explicit environment override', () => {
  assert.equal(resolveAntigravityExecutable({ ANTIGRAVITY_CLI_PATH: 'C:\\agy\\agy.exe' }), 'C:\\agy\\agy.exe')
})

test('probe rejects old Antigravity runtimes without structured output', async () => {
  const probe = await probeAntigravityRuntime({
    executable: 'fake-agy',
    run: async (_executable, args) => args[0] === '--version'
      ? { stdout: '1.1.1\n', stderr: '' }
      : { stdout: 'Usage: agy --print\n', stderr: '' },
  })
  assert.equal(probe.status, 'incompatible')
  assert.equal(probe.runtimeVersion, '1.1.1')
})

test('probe marks a structured-output runtime ready', async () => {
  const probe = await probeAntigravityRuntime({
    run: async (_executable, args) => args[0] === '--version'
      ? { stdout: '1.1.8\n', stderr: '' }
      : { stdout: '--output-format <format>\n', stderr: '' },
  })
  assert.equal(probe.status, 'ready')
  assert.equal(probe.runtimeVersion, '1.1.8')
})

test('probe reports a missing executable without throwing', async () => {
  const error = Object.assign(new Error('not found'), { code: 'ENOENT' })
  const probe = await probeAntigravityRuntime({ run: async () => { throw error } })
  assert.equal(probe.status, 'dependencyMissing')
})

test('model catalog comes from the installed CLI output', async () => {
  const models = await listAntigravityModels({
    run: async () => ({
      stdout: 'gemini-3.7-flash-high\tGemini 3.7 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n',
      stderr: '',
    }),
  })
  assert.equal(models[0]?.value, 'gemini-3.7-flash-high')
  assert.equal(models[0]?.defaultReasoningEffort, 'high')
  assert.deepEqual(models[0]?.reasoningEfforts, ['high'])
  assert.equal(models[0]?.isDefault, false)
  assert.equal(models[1]?.displayName, 'Claude Sonnet 4.6 (Thinking)')
})
