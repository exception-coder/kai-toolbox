import assert from 'node:assert/strict'
import test from 'node:test'
import {
  closeOpenCodexAppServerActivities,
  classifyCodexAppServerMessage,
  classifyCodexAppServerError,
  codexReconnectDeadlineMs,
  findDefaultCodexModel,
  isCodexAppServerRecoverySignal,
  isCodexTransportFallbackWarning,
  isCurrentCodexTurnNotification,
  normalizeCodexModel,
  resolveCodexAppServerRequest,
} from './codexAppServer.js'

test('distinguishes responses, notifications, and bidirectional server requests', () => {
  assert.equal(classifyCodexAppServerMessage({ id: 1, result: {} }), 'response')
  assert.equal(classifyCodexAppServerMessage({ method: 'turn/completed', params: {} }), 'notification')
  assert.equal(classifyCodexAppServerMessage({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: {} }), 'serverRequest')
  assert.equal(classifyCodexAppServerMessage({ id: 1 }), 'invalid')
})

test('maps App Server command approval through the shared permission boundary', async () => {
  const calls: Array<{ toolName: string; input: Record<string, unknown> }> = []
  const resolution = await resolveCodexAppServerRequest(
    'item/commandExecution/requestApproval',
    { command: 'npm test', cwd: 'D:\\workspace', reason: 'run tests' },
    async (toolName, input) => {
      calls.push({ toolName, input })
      return { behavior: 'allow', updatedInput: input }
    },
  )

  assert.deepEqual(resolution, { result: { decision: 'accept' } })
  assert.equal(calls[0]?.toolName, 'Bash')
  assert.equal(calls[0]?.input.command, 'npm test')
})

test('fails unsupported App Server requests closed instead of dropping them', async () => {
  const resolution = await resolveCodexAppServerRequest(
    'item/tool/call',
    { tool: 'unregistered' },
    async () => ({ behavior: 'allow' }),
  )

  assert.equal(resolution.error?.code, -32601)
  assert.match(resolution.error?.message ?? '', /item\/tool\/call/)
})

test('maps request user input answers to the App Server response schema', async () => {
  const resolution = await resolveCodexAppServerRequest(
    'item/tool/requestUserInput',
    { questions: [{ id: 'choice', question: '继续吗' }] },
    async () => ({ behavior: 'allow', updatedInput: { answers: { choice: '继续' } } }),
  )

  assert.deepEqual(resolution, { result: { answers: { choice: { answers: ['继续'] } } } })
})

test('closes unfinished command and MCP activities before the turn terminal event', () => {
  const events: Record<string, unknown>[] = []
  const commands = new Map([['command-1', {
    command: 'mvn package',
    cwd: 'D:\\workspace',
    output: 'building module 40',
    startedAt: Date.now() - 5_000,
  }]])
  const mcpTools = new Map([['mcp-1', {
    toolName: 'graphify/query',
    startedAt: Date.now() - 2_000,
  }]])

  closeOpenCodexAppServerActivities(event => events.push(event), commands, mcpTools, 'App Server exited')

  assert.equal(commands.size, 0)
  assert.equal(mcpTools.size, 0)
  assert.deepEqual(events.map(event => [event.type, event.toolCallId, event.status]), [
    ['toolResult', 'command-1', undefined],
    ['toolActivity', 'command-1', 'failed'],
    ['toolResult', 'mcp-1', undefined],
    ['toolActivity', 'mcp-1', 'failed'],
  ])
  assert.match(String(events[0]?.output), /building module 40/)
  assert.match(String(events[0]?.output), /App Server exited/)
})

test('closing unfinished App Server activities is idempotent', () => {
  const events: Record<string, unknown>[] = []
  const commands = new Map([['command-1', {
    command: 'npm run build',
    cwd: 'D:\\workspace',
    output: '',
    startedAt: Date.now(),
  }]])
  const mcpTools = new Map<string, { toolName: string; startedAt: number }>()

  closeOpenCodexAppServerActivities(event => events.push(event), commands, mcpTools, 'Turn ended')
  closeOpenCodexAppServerActivities(event => events.push(event), commands, mcpTools, 'Turn ended')

  assert.equal(events.length, 2)
})

test('preserves the App Server default-model marker and all supported efforts', () => {
  const model = normalizeCodexModel({
    model: 'gpt-5.6-sol',
    displayName: 'GPT-5.6-Sol',
    isDefault: true,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [
      { reasoningEffort: 'low' },
      { reasoningEffort: 'medium' },
      { reasoningEffort: 'high' },
      { reasoningEffort: 'xhigh' },
      { reasoningEffort: 'max' },
      { reasoningEffort: 'ultra' },
    ],
  })

  assert.equal(model?.isDefault, true)
  assert.deepEqual(model?.reasoningEfforts, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
})

test('never guesses the first catalog item when App Server has not marked a default', () => {
  const models = [
    { value: 'first', displayName: 'First', description: '', reasoningEfforts: [], defaultReasoningEffort: 'high', fastSupported: false, isDefault: false },
    { value: 'default', displayName: 'Default', description: '', reasoningEfforts: [], defaultReasoningEffort: 'low', fastSupported: false, isDefault: true },
  ]
  assert.equal(findDefaultCodexModel(models)?.value, 'default')
  assert.equal(findDefaultCodexModel(models.slice(0, 1)), undefined)
})

test('keeps structured retryable App Server errors non-terminal', () => {
  const result = classifyCodexAppServerError({
    error: { message: 'stream disconnected: Reconnecting... 2/5' },
    willRetry: true,
    turnId: 'turn-1',
  })
  assert.equal(result.willRetry, true)
  assert.equal(result.attempt, 2)
  assert.equal(result.maxAttempts, 5)
})

test('structured terminal flag wins over legacy reconnect wording', () => {
  const result = classifyCodexAppServerError({
    error: { message: 'Reconnecting... 5/5' },
    willRetry: false,
  })
  assert.equal(result.willRetry, false)
  assert.equal(result.retryExhausted, false)
})

test('supports reconnect notices emitted by older Codex clients', () => {
  const result = classifyCodexAppServerError({ message: 'Reconnecting... 1/5' })
  assert.equal(result.willRetry, true)
  assert.equal(result.retryExhausted, false)
  assert.equal(result.attempt, 1)
})

test('treats the last legacy reconnect notice as exhausted', () => {
  const result = classifyCodexAppServerError({ message: 'Reconnecting... 2/2' })
  assert.equal(result.willRetry, false)
  assert.equal(result.retryExhausted, true)
  assert.equal(result.attempt, 2)
  assert.equal(result.maxAttempts, 2)
})

test('keeps ordinary App Server errors terminal', () => {
  const result = classifyCodexAppServerError({ error: { message: 'authentication failed' } })
  assert.equal(result.willRetry, false)
})

test('recognizes only the Codex WebSocket to HTTPS fallback warning', () => {
  assert.equal(isCodexTransportFallbackWarning(
    'Falling back from WebSockets to HTTPS transport. stream disconnected before completion: websocket closed by server before response.completed',
  ), true)
  assert.equal(isCodexTransportFallbackWarning('WebSocket connection is slow; HTTPS remains available'), false)
  assert.equal(isCodexTransportFallbackWarning('configuration warning'), false)
})

test('accepts all meaningful turn progress as reconnect recovery signals', () => {
  for (const method of [
    'item/reasoning/summaryTextDelta',
    'item/commandExecution/outputDelta',
    'item/mcpToolCall/progress',
    'thread/tokenUsage/updated',
    'thread/status/changed',
    'turn/plan/updated',
    'hook/completed',
  ]) {
    assert.equal(isCodexAppServerRecoverySignal(method), true, method)
  }
  assert.equal(isCodexAppServerRecoverySignal('error'), false)
  assert.equal(isCodexAppServerRecoverySignal('warning'), false)
})

test('gives native retries minutes to recover and legacy final retries a practical grace period', () => {
  const retrying = classifyCodexAppServerError({
    error: { message: 'stream disconnected: Reconnecting... 2/5' },
    willRetry: true,
  })
  const legacyFinal = classifyCodexAppServerError({ message: 'Reconnecting... 5/5' })

  assert.equal(codexReconnectDeadlineMs(retrying), 5 * 60_000)
  assert.equal(codexReconnectDeadlineMs(legacyFinal), 60_000)
})

test('accepts notifications from the current root thread and turn', () => {
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turnId: 'root-turn' },
    'root-thread',
    'root-turn',
  ), true)
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turn: { id: 'root-turn' } },
    'root-thread',
    'root-turn',
  ), true)
})

test('rejects child-agent and stale root-turn notifications', () => {
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'child-thread', turnId: 'child-turn' },
    'root-thread',
    'root-turn',
  ), false)
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turnId: 'previous-turn' },
    'root-thread',
    'root-turn',
  ), false)
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'child-thread', turn: { id: 'child-turn' } },
    'root-thread',
    'root-turn',
  ), false)
})

test('accepts same-thread events before turn/start responds and global events without ids', () => {
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turnId: 'root-turn' },
    'root-thread',
    undefined,
  ), true)
  assert.equal(isCurrentCodexTurnNotification(
    { summary: 'global configuration warning' },
    'root-thread',
    'root-turn',
  ), true)
})
