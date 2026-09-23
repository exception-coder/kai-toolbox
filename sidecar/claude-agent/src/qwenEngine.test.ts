import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SDKMessage } from '@qwen-code/sdk'
import { listQwenModels, mapQwenPermissionMode, runQwenTurn, translateQwenMessage, type QwenQueryLike } from './qwenEngine.js'

test('maps Forge permissions to conservative Qwen modes', () => {
  assert.equal(mapQwenPermissionMode('default'), 'default')
  assert.equal(mapQwenPermissionMode('acceptEdits'), 'auto-edit')
  assert.equal(mapQwenPermissionMode('plan'), 'plan')
  assert.equal(mapQwenPermissionMode('bypassPermissions'), 'yolo')
  assert.equal(mapQwenPermissionMode('bypassPermissions', 'disabled'), 'plan')
  assert.equal(mapQwenPermissionMode('bypassPermissions', 'consult-readonly'), 'plan')
})

test('translates streamed text, tools and terminal usage without duplicating text', () => {
  const events: Array<Record<string, unknown>> = []
  const streamed = new Map<number, string>()
  const tools = new Map<string, string>()
  translateQwenMessage({
    type: 'stream_event', uuid: 'partial-1', session_id: 'qwen-1', parent_tool_use_id: null,
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } },
  }, event => events.push(event), streamed, tools)
  translateQwenMessage({
    type: 'assistant', uuid: 'assistant-1', session_id: 'qwen-1', parent_tool_use_id: null,
    message: {
      id: 'message-1', type: 'message', role: 'assistant', model: 'qwen3-coder', usage: { input_tokens: 2, output_tokens: 3 },
      content: [{ type: 'text', text: 'hello world' }, { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } }],
    },
  }, event => events.push(event), streamed, tools)
  translateQwenMessage({
    type: 'result', subtype: 'success', uuid: 'result-1', session_id: 'qwen-1', is_error: false,
    duration_ms: 3, duration_api_ms: 2, num_turns: 1, result: 'hello world',
    usage: { input_tokens: 2, output_tokens: 3 }, permission_denials: [],
  }, event => events.push(event), streamed, tools)

  assert.deepEqual(events.filter(event => event.type === 'assistantDelta').map(event => event.text), ['hello', ' world'])
  assert.equal(events.some(event => event.type === 'toolUse' && event.toolCallId === 'tool-1'), true)
  assert.equal(events.at(-1)?.type, 'result')
})

test('resumes the persisted Qwen session and reports a recoverable authentication error', async () => {
  let options: Record<string, unknown> | undefined
  const queryFactory = ((args: { options?: Record<string, unknown> }) => {
    options = args.options
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
        throw new Error('unauthorized: login required')
      },
      close: async () => undefined,
    } satisfies QwenQueryLike
  })
  const events: Array<Record<string, unknown>> = []
  await runQwenTurn({
    text: 'continue', cwd: process.cwd(), sdkSessionId: 'qwen-session-1', permissionMode: 'default',
    signal: new AbortController().signal, emit: event => events.push(event), setSdkSessionId: () => undefined,
  }, queryFactory as never)

  assert.equal(options?.resume, 'qwen-session-1')
  assert.match(String(events.find(event => event.type === 'error')?.message), /认证不可用/)
  assert.equal(events.at(-1)?.stopReason, 'error')
})

test('Qwen model catalog uses the SDK account and preserves provider model IDs', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen-models-test-'))
  const previousHome = process.env.QWEN_HOME
  process.env.QWEN_HOME = home
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ security: { auth: { selectedType: 'openai' } } }))
  t.after(() => { if (previousHome === undefined) delete process.env.QWEN_HOME; else process.env.QWEN_HOME = previousHome; fs.rmSync(home, { recursive: true, force: true }) })
  let closed = false
  const factory = (() => ({
    async *[Symbol.asyncIterator](): AsyncIterator<SDKMessage> {},
    getAvailableModels: async () => ({ subtype: 'get_available_models', models: [
      { id: 'qwen3-coder', label: 'Qwen3 Coder', contextWindowSize: 262144 },
    ] }),
    close: async () => { closed = true },
  } satisfies QwenQueryLike))
  assert.deepEqual(await listQwenModels(process.cwd(), factory as never), [
    { value: 'qwen3-coder', displayName: 'Qwen3 Coder', description: '上下文 262,144 tokens' },
  ])
  assert.equal(closed, true)
})

test('Qwen exit code 1 explains missing CLI auth instead of guessing a model failure', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen-auth-test-'))
  const previousHome = process.env.QWEN_HOME
  const authKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'] as const
  const previousKeys = authKeys.map(key => process.env[key])
  process.env.QWEN_HOME = home
  authKeys.forEach(key => { delete process.env[key] })
  t.after(() => {
    if (previousHome === undefined) delete process.env.QWEN_HOME; else process.env.QWEN_HOME = previousHome
    authKeys.forEach((key, index) => { if (previousKeys[index] === undefined) delete process.env[key]; else process.env[key] = previousKeys[index] })
    fs.rmSync(home, { recursive: true, force: true })
  })
  const events: Array<Record<string, unknown>> = []
  await runQwenTurn({ text: 'hello', cwd: home, permissionMode: 'default', signal: new AbortController().signal,
    emit: event => events.push(event), setSdkSessionId: () => undefined }, (() => ({
    async *[Symbol.asyncIterator](): AsyncIterator<SDKMessage> { throw new Error('CLI process exited with code 1') },
    close: async () => undefined,
  })) as never)
  const error = events.find(event => event.type === 'error')
  assert.equal(error?.code, 'QWEN_AUTH_REQUIRED')
  assert.match(String(error?.message), /尚未选择认证方式/)
})
