import assert from 'node:assert/strict'
import test from 'node:test'
import { Session } from '../sessionManager.js'
import { claudeSessionStatus, claudeTurnFailure, classifyTurnFailure, codexSessionStatus } from './nativeSessionStatus.js'

test('native codes classify failures without matching assistant prose', () => {
  const cases = { usageLimitExceeded: 'quota', contextWindowExceeded: 'context', unauthorized: 'authentication',
    serverOverloaded: 'network', sandboxError: 'request', cyberPolicy: 'refusal', error_max_turns: 'limit',
    incomplete: 'incomplete', futureError: 'unknown' }
  for (const [code, category] of Object.entries(cases)) assert.equal(classifyTurnFailure(code).category, category)
  assert.equal(classifyTurnFailure({ httpConnectionFailed: { httpStatusCode: 401 } }).category, 'authentication')
  assert.equal(classifyTurnFailure({ responseStreamDisconnected: { httpStatusCode: 429 } }).category, 'quota')
  assert.deepEqual(classifyTurnFailure('message with token=secret'), { category: 'unknown' })
  assert.equal(claudeTurnFailure({ subtype: 'success', is_error: true }, classifyTurnFailure('rate_limit'))?.category, 'quota')
  assert.equal(claudeTurnFailure({ subtype: 'error_during_execution', terminal_reason: 'prompt_too_long' })?.category, 'context')
  assert.equal(claudeTurnFailure({ subtype: 'success' }, classifyTurnFailure('rate_limit')), undefined)
  assert.equal(claudeTurnFailure({ subtype: 'success', is_error: true, api_error_status: 429, terminal_reason: 'api_error' })?.category, 'quota')
  assert.equal(claudeTurnFailure({ subtype: 'success', is_error: true, terminal_reason: 'api_error' }, classifyTurnFailure('authentication_failed'))?.category, 'authentication')
  assert.equal(claudeTurnFailure({ subtype: 'success', terminal_reason: 'tool_deferred' })?.code, 'tool_deferred')
})

test('Codex flags and Claude retries preserve supported native evidence', () => {
  assert.equal(codexSessionStatus({ type: 'active', activeFlags: ['waitingOnApproval'] })?.state, 'awaitingApproval')
  assert.equal(codexSessionStatus({ type: 'active', activeFlags: ['waitingOnUserInput'] })?.state, 'awaitingInput')
  assert.equal(codexSessionStatus({ type: 'systemError' })?.state, 'failed')
  assert.equal(codexSessionStatus({ type: 'future' }), undefined)
  assert.deepEqual(claudeSessionStatus({ subtype: 'api_retry', attempt: 2, max_retries: 5, retry_delay_ms: 1000 }),
    { source: 'claude', state: 'retrying', attempt: 2, maxAttempts: 5, retryDelayMs: 1000 })
  assert.deepEqual(claudeSessionStatus({ subtype: 'api_retry', attempt: -1, max_retries: 'secret' }),
    { source: 'claude', state: 'retrying' })
})

for (const idleFirst of [true, false]) test(`Claude idle/result ordering (${idleFirst}) cannot release before cleanup`, async () => {
  const events: Record<string, unknown>[] = []
  const session = new Session('s', process.cwd(), event => events.push(event))
  session.sdkSessionId = 'native'
  const handle = (message: Record<string, unknown>) => (session as unknown as {
    handle(m: Record<string, unknown>, names: Map<string, string>, times: Map<string, number>): void
  }).handle({ session_id: 'native', ...message }, new Map(), new Map())
  let release!: () => void
  const cleanup = new Promise<void>(resolve => { release = resolve })
  Object.assign(session, { executeTurn: async () => {
    handle({ type: 'system', subtype: 'session_state_changed', state: 'running' })
    handle({ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 5 })
    assert.equal(session.runtimeState().nativeStatus?.state, 'retrying')
    handle({ type: 'system', subtype: 'session_state_changed', state: 'requires_action', session_id: 'child' })
    handle({ type: 'system', subtype: 'session_state_changed', state: 'idle', parent_tool_use_id: 'child-tool' })
    assert.equal(session.runtimeState().nativeStatus?.state, 'retrying')
    const idle = () => handle({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    const result = () => handle({ type: 'result', subtype: 'success', usage: {} })
    if (idleFirst) { idle(); result() } else { result(); idle() }
    assert.equal(session.runtimeState().active, true)
    assert.equal(events.filter(e => e.type === 'result').length, 0)
    await cleanup
  } })
  const pending = session.runTurn('task', undefined, undefined, undefined, 'turn')
  release()
  await pending
  assert.equal(events.filter(e => e.type === 'result').length, 1)
  assert.equal(session.runtimeState().active, false)
  assert.equal(session.runtimeState().nativeStatus, undefined)
  handle({ type: 'system', subtype: 'session_state_changed', state: 'running' })
  assert.equal(session.runtimeState().nativeStatus, undefined)
})

test('Claude error result retains category and does not turn into success on cleanup', async () => {
  const events: Record<string, unknown>[] = []
  const session = new Session('failed', process.cwd(), event => events.push(event))
  const handle = (message: Record<string, unknown>) => (session as unknown as {
    handle(m: Record<string, unknown>, names: Map<string, string>, times: Map<string, number>): void
  }).handle(message, new Map(), new Map())
  Object.assign(session, { executeTurn: async () => {
    handle({ type: 'assistant', error: 'authentication_failed', message: { content: [] } })
    handle({ type: 'result', subtype: 'success', is_error: true, usage: {} })
  } })
  await session.runTurn('task', undefined, undefined, undefined, 'failed-turn')
  const result = events.find(e => e.type === 'result')
  assert.equal(result?.stopReason, 'error')
  assert.equal((result?.failure as { category: string }).category, 'authentication')
})
