import assert from 'node:assert/strict'
import test from 'node:test'
import type { SDKMessage } from '@qwen-code/sdk'
import { mapQwenPermissionMode, runQwenTurn, translateQwenMessage, type QwenQueryLike } from './qwenEngine.js'

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
