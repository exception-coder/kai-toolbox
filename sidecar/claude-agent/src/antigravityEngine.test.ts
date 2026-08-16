import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAntigravityArgs,
  explainAntigravityFailure,
  parseAntigravityLine,
  resolveAntigravityTerminal,
  summarizeAntigravityError,
} from './antigravityEngine.js'

test('args use an explicit conversation and never global continue', () => {
  const args = buildAntigravityArgs({
    text: 'fix it',
    additionalDirectories: ['D:\\repo-2'],
    model: 'gemini-3.1-pro',
    reasoningEffort: 'high',
    permissionMode: 'acceptEdits',
    sdkSessionId: 'conversation-1',
  })
  assert.deepEqual(args.slice(0, 2), ['--print', args[1]])
  assert.ok(args.includes('stream-json'))
  assert.equal(args[args.indexOf('--print-timeout') + 1], '15m')
  assert.ok(args.includes('--conversation'))
  assert.ok(args.includes('conversation-1'))
  assert.equal(args[args.indexOf('--effort') + 1], 'high')
  assert.ok(args.includes('accept-edits'))
  assert.equal(args.includes('--continue'), false)
  assert.equal(args.includes('-c'), false)
})

test('headless default uses safe edit mode while bypass remains explicit', () => {
  assert.ok(buildAntigravityArgs({ text: 'x', permissionMode: 'bypassPermissions' }).includes('--dangerously-skip-permissions'))
  assert.equal(buildAntigravityArgs({ text: 'x', permissionMode: 'default' }).includes('--dangerously-skip-permissions'), false)
  assert.ok(buildAntigravityArgs({ text: 'x', permissionMode: 'default' }).includes('accept-edits'))
  assert.ok(buildAntigravityArgs({ text: 'x', permissionMode: 'default' }).includes('--new-project'))
})

test('nested tool lifecycle is normalized', () => {
  const active = parseAntigravityLine(JSON.stringify({
    event: 'step_update',
    step_update: { conversation_id: 'conversation-3', step_index: 4, step_type: 'tool', state: 'ACTIVE', tool_name: 'view_file', tool_info: { parameters: { AbsolutePath: 'README.md' } } },
  }))
  const done = parseAntigravityLine(JSON.stringify({
    event: 'step_update',
    step_update: { conversation_id: 'conversation-3', step_index: 4, step_type: 'tool', state: 'DONE', tool_name: 'view_file', tool_info: { output: '20 lines' } },
  }))
  assert.equal(active.events[0]?.type, 'toolUse')
  assert.equal(done.events[0]?.type, 'toolResult')
})

test('nested error result never becomes a successful turn result', () => {
  const parsed = parseAntigravityLine(JSON.stringify({
    event: 'result',
    result: { conversation_id: 'conversation-4', status: 'ERROR', error: 'Agent failed' },
  }))
  assert.deepEqual(parsed.events, [{ type: 'error', code: 'ANTIGRAVITY_ERROR', message: 'Agent failed' }])
})

test('stream parser captures conversation id and assistant text', () => {
  const parsed = parseAntigravityLine(JSON.stringify({
    type: 'message', conversation_id: 'conversation-2', role: 'assistant', text: 'done',
  }))
  assert.equal(parsed.sessionId, 'conversation-2')
  assert.deepEqual(parsed.events, [{ type: 'assistantDelta', text: 'done' }])
})

test('stream parser maps result usage', () => {
  const parsed = parseAntigravityLine(JSON.stringify({ type: 'result', response: 'final', usage: { input_tokens: 12 } }))
  assert.equal(parsed.events[0]?.type, 'assistantDelta')
  assert.equal(parsed.events[1]?.type, 'result')
})

test('stream parser maps Antigravity 1.1.13 nested step and result events', () => {
  const step = parseAntigravityLine(JSON.stringify({
    event: 'step_update',
    step_update: {
      conversation_id: 'conversation-3',
      step_type: 'agent_response',
      text_delta: 'OK\n',
    },
  }))
  const result = parseAntigravityLine(JSON.stringify({
    event: 'result',
    result: {
      conversation_id: 'conversation-3',
      status: 'SUCCESS',
      response: 'OK\n',
      usage: { input_tokens: 10, output_tokens: 2 },
    },
  }))

  assert.equal(step.sessionId, 'conversation-3')
  assert.deepEqual(step.events, [{ type: 'assistantDelta', text: 'OK\n' }])
  assert.equal(result.sessionId, 'conversation-3')
  assert.deepEqual(result.events, [
    { type: 'assistantDelta', text: 'OK\n', finalFallback: true },
    { type: 'result', usage: { input_tokens: 10, output_tokens: 2 }, stopReason: 'end_turn' },
  ])
})

test('CLI usage output keeps the actionable diagnostic instead of the help footer', () => {
  const stderr = [
    'invalid value "900" for flag -print-timeout: time: missing unit in duration "900"',
    'Usage of agy.exe:',
    '  --sandbox  Run in a sandbox with terminal restrictions enabled',
    'Available subcommands:',
    '  update  Update CLI',
  ].join('\n')

  assert.equal(
    summarizeAntigravityError(stderr, 2),
    'invalid value "900" for flag -print-timeout: time: missing unit in duration "900"',
  )
})

test('location rejection is reported as an authenticated upstream restriction', () => {
  assert.match(
    explainAntigravityFailure(
      'FAILED_PRECONDITION (code 400): User location is not supported for the API use.',
      'Agent execution terminated due to error.',
    ),
    /CLI 已登录.*网络出口地区不受支持/,
  )
})

test('successful keyring authentication overrides transient startup not-logged messages', () => {
  const message = explainAntigravityFailure([
    'Skipping telemetry propagation because user is not logged in',
    'ChainedAuth: authenticated via keyring',
    'OAuth: authenticated successfully as user@example.com',
    'invalid model selection',
  ].join('\n'), 'Agent execution terminated due to error.')
  assert.equal(message, 'Agent execution terminated due to error.')
})

test('authenticated quotaProject metadata is not exposed as a provider error', () => {
  const diagnostic = [
    'ChainedAuth: authenticated via keyring',
    'ERROR: logging before google.Init: I0816 03:02:12.550002 1 server_oauth.go:189] applyAuthResult: email=user@example.com, authMethod=consumer, quotaProject=',
    'OAuth: authenticated successfully as user@example.com',
  ].join('\n')

  assert.equal(
    explainAntigravityFailure(diagnostic, 'Antigravity 本轮没有生成可见回复。'),
    'Antigravity 本轮没有生成可见回复。',
  )
})

test('real quota exhaustion remains actionable', () => {
  assert.match(
    explainAntigravityFailure('RESOURCE_EXHAUSTED: quota exceeded for requests', 'fallback'),
    /RESOURCE_EXHAUSTED.*quota exceeded/,
  )
})

test('failed result and non-zero process exit collapse into one terminal error', () => {
  const terminal = resolveAntigravityTerminal({
    aborted: false,
    timedOut: false,
    idleTimedOut: false,
    exitCode: 1,
    sawText: false,
    pendingError: { type: 'error', code: 'ANTIGRAVITY_ERROR', message: 'Agent execution terminated due to error.' },
    diagnostic: 'FAILED_PRECONDITION (code 400): User location is not supported for the API use.',
  })
  assert.equal(terminal.type, 'error')
  assert.equal(terminal.code, 'ANTIGRAVITY_ERROR')
  assert.match(String(terminal.message), /网络出口地区不受支持/)
})

test('successful but empty result fails closed instead of pretending completion', () => {
  const terminal = resolveAntigravityTerminal({
    aborted: false,
    timedOut: false,
    idleTimedOut: false,
    exitCode: 0,
    sawText: false,
    pendingResult: { type: 'result', usage: {}, stopReason: 'end_turn' },
    diagnostic: '',
  })
  assert.equal(terminal.code, 'ANTIGRAVITY_EMPTY_RESPONSE')
  assert.match(String(terminal.message), /生成或工具调用阶段提前结束.*原会话上下文已保留/)
})
