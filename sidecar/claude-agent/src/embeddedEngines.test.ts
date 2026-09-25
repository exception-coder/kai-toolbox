import assert from 'node:assert/strict'
import test from 'node:test'
import { copilotPermissionInput, copilotSessionConfig, runCopilotTurn } from './copilotEngine.js'
import { piPermissionInput, runPiTurn } from './piEngine.js'
import { safeEngineError, type EmbeddedEngineContext } from './engine/embeddedEngineContext.js'

function context(): EmbeddedEngineContext & { events: Record<string, unknown>[] } {
  const events: Record<string, unknown>[] = []
  return { cwd: process.cwd(), text: 'hello', events, signal: new AbortController().signal,
    emit: event => events.push(event), setSdkSessionId: () => undefined,
    canUseTool: async () => ({ behavior: 'deny', message: 'test denial' }) }
}

test('Copilot BYOK is explicit and does not load implicit config', () => {
  const config = copilotSessionConfig({ ...context(), apiBaseUrl: 'http://localhost:1234/v1', authToken: 'test-key', model: 'test-model' })
  assert.equal(config.model, 'test-model')
  assert.equal(config.enableConfigDiscovery, false)
  assert.deepEqual(config.provider, { type: 'openai', wireApi: 'completions', baseUrl: 'http://localhost:1234/v1', apiKey: 'test-key' })
  assert.equal(copilotSessionConfig(context()).provider, undefined)
  assert.throws(() => copilotSessionConfig({ ...context(), apiBaseUrl: 'http://localhost' }), /API Key/)
})

test('native tool names map to Forge execution permission controls', () => {
  assert.equal(piPermissionInput('powershell', { command: 'git status' }).name, 'Bash')
  assert.equal(piPermissionInput('write', { path: 'a' }).input.file_path, 'a')
  assert.equal(copilotPermissionInput('edit', { path: 'a' })?.name, 'Edit')
  assert.equal(copilotPermissionInput('create', { path: 'a' })?.input.file_path, 'a')
  assert.equal(copilotPermissionInput('unknown', {}), undefined)
})

test('Copilot pre-tool hook denies unadapted and rejected operations', async () => {
  const config = copilotSessionConfig(context())
  const invoke = (name: string) => config.hooks!.onPreToolUse!({ timestamp: new Date(0), sessionId: 'test', workingDirectory: process.cwd(), toolName: name, toolArgs: {} }, { sessionId: 'test' })
  assert.equal((await invoke('unknown'))?.permissionDecision, 'deny')
  assert.equal((await invoke('bash'))?.permissionDecision, 'deny')
})

test('errors redact the session secret', () => {
  assert.equal(safeEngineError(new Error('failed test-key'), 'test-key'), 'failed [REDACTED]')
})

test('Copilot permissions preserve allow, reject modified arguments, and bound tool calls', async () => {
  const ctx = context()
  ctx.canUseTool = async (_name, input) => ({ behavior: 'allow', updatedInput: input })
  let bounded = false
  const hook = copilotSessionConfig(ctx, () => { bounded = true }).hooks!.onPreToolUse!
  const input = { sessionId: 'test', timestamp: new Date(), workingDirectory: ctx.cwd, toolName: 'view', toolArgs: { path: 'a' } }
  assert.equal((await hook(input, { sessionId: 'test' }))?.permissionDecision, 'allow')
  ctx.canUseTool = async () => ({ behavior: 'allow', updatedInput: { file_path: 'different' } })
  assert.equal((await hook(input, { sessionId: 'test' }))?.permissionDecision, 'deny')
  for (let i = 0; i < 100; i++) await hook(input, { sessionId: 'test' })
  assert.equal(bounded, true)
})

for (const [name, execute] of [['Pi', runPiTurn], ['Copilot', runCopilotTurn]] as const) {
  test(`${name} cancellation does not report successful completion`, async () => {
    const ctx = context()
    await execute({ ...ctx, signal: AbortSignal.abort() })
    assert.equal(ctx.events.at(-1)?.stopReason, 'interrupted')
    assert.ok(!ctx.events.some(event => event.stopReason === 'end_turn'))
  })
  test(`${name} incomplete BYOK returns explicit error, not empty success`, async () => {
    const ctx = context()
    await execute({ ...ctx, apiBaseUrl: 'http://127.0.0.1:1/v1' })
    assert.ok(ctx.events.some(event => event.type === 'error'))
    assert.equal(ctx.events.at(-1)?.stopReason, 'error')
  })
}
