import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess, spawn } from 'node:child_process'
import { parseZCodeLine, runZCodeTurn, zcodeExecArgs, type ZCodeTurnContext } from './zcodeEngine.js'

function context(): ZCodeTurnContext & { events: Array<Record<string, unknown>>; nativeIds: string[] } {
  const events: Array<Record<string, unknown>> = [], nativeIds: string[] = []
  return { text: '检查代码', cwd: process.cwd(), permissionMode: 'default', signal: new AbortController().signal,
    events, nativeIds, emit: event => events.push(event), setSdkSessionId: id => nativeIds.push(id) }
}

function launcher(lines: string[], code = 0, captured: { args?: string[] } = {}): typeof spawn {
  return ((_command: string, args: string[]) => {
    captured.args = args
    const child = new EventEmitter() as ChildProcess
    const stdout = new PassThrough(), stderr = new PassThrough()
    let closed = false
    const close = (exit: number) => { if (!closed) { closed = true; child.emit('close', exit) } }
    Object.assign(child, { stdout, stderr, kill: () => { queueMicrotask(() => close(1)); return true } })
    queueMicrotask(() => { stdout.write(lines.join('\n') + '\n'); queueMicrotask(() => close(code)) })
    return child
  }) as unknown as typeof spawn
}

test('ZCode explicitly maps modes and only resumes the owned native session', () => {
  const ctx = context()
  assert.equal(zcodeExecArgs(ctx)[3], 'build')
  assert.equal(zcodeExecArgs({ ...ctx, permissionMode: 'bypassPermissions' })[3], 'yolo')
  assert.equal(zcodeExecArgs({ ...ctx, permissionMode: 'plan' })[3], 'plan')
  const args = zcodeExecArgs({ ...ctx, sdkSessionId: 'sess_owned', developerInstructions: 'Forge规则' })
  assert.equal(args[args.indexOf('--resume') + 1], 'sess_owned')
  assert.equal(args.includes('--continue'), false)
  assert.equal(args.at(-1), 'Forge规则\n\n检查代码')
  assert.equal(args[args.indexOf('--workflow-mode') + 1], 'disabled')
  for (const toolPolicy of ['disabled', 'review-only', 'consult-readonly']) assert.throws(() => zcodeExecArgs({ ...ctx, toolPolicy }), /受限会话/)
  assert.throws(() => zcodeExecArgs({ ...ctx, model: 'foreign-model' }), /原生默认模型/)
  assert.throws(() => zcodeExecArgs({ ...ctx, text: 'x'.repeat(20001) }), /20000/)
})

test('parses the upstream 0.17.1 stream-json envelope and tagged terminal result', () => {
  assert.deepEqual(parseZCodeLine(JSON.stringify({ type: 'model.streaming', sessionId: 'sess_1', payload: { kind: 'text_delta', delta: '你好' } })),
    { sessionId: 'sess_1', delta: '你好' })
  assert.equal(parseZCodeLine('{"type":"result","response":"完成","sessionId":"sess_1"}').final, '完成')
  assert.equal(parseZCodeLine('{"type":"model.streaming","payload":{"kind":"reasoning_delta","delta":"private"}}').delta, undefined)
  assert.deepEqual(parseZCodeLine('{"type":"result","sessionId":"sess_1","response":"done","usage":{"inputTokens":12,"outputTokens":3,"source":"provider"}}').usage,
    { input_tokens: 12, output_tokens: 3 })
})

test('routes streaming, tool lifecycle and final result through existing Forge events', async () => {
  const ctx = context(), captured: { args?: string[] } = {}
  await runZCodeTurn(ctx, launcher([
    JSON.stringify({ type: 'model.streaming', sessionId: 'sess_owned', payload: { kind: 'text_delta', delta: '已' } }),
    JSON.stringify({ type: 'tool.updated', sessionId: 'sess_owned', payload: { kind: 'started', toolCallId: 'call1', toolName: 'Read' } }),
    JSON.stringify({ type: 'tool.updated', sessionId: 'sess_owned', payload: { kind: 'result', toolCallId: 'call1', result: { content: 'code' } } }),
    JSON.stringify({ type: 'result', sessionId: 'sess_owned', response: '已完成', projection: { status: 'idle' } }),
  ], 0, captured))
  assert.deepEqual(ctx.nativeIds, ['sess_owned'])
  assert.equal(ctx.events.find(event => event.type === 'assistantDelta')?.text, '已')
  assert.equal(ctx.events.find(event => event.type === 'toolUse')?.toolName, 'Read')
  assert.equal(ctx.events.find(event => event.type === 'toolResult')?.output, 'code')
  assert.equal(ctx.events.at(-1)?.stopReason, 'end_turn')
  assert.equal(captured.args?.includes('--continue'), false)
})

test('zero exit without final result and malformed JSONL cannot report success', async () => {
  for (const lines of [['{"type":"model.streaming","sessionId":"sess_1","payload":{"kind":"text_delta","delta":"partial"}}'], ['not-json'], ['{"type":"result","response":"missing identity"}']]) {
    const ctx = context()
    await runZCodeTurn(ctx, launcher(lines))
    assert.equal(ctx.events.at(-1)?.stopReason, 'error')
    assert.equal(ctx.events.some(event => event.type === 'assistantSnapshot'), false)
  }
})

test('rejects native session identity changes and events after terminal result', async () => {
  const ctx = { ...context(), sdkSessionId: 'sess_owned' }
  await runZCodeTurn(ctx, launcher(['{"type":"result","sessionId":"sess_other","response":"wrong"}']))
  assert.equal(ctx.events.at(-1)?.stopReason, 'error')
  assert.deepEqual(ctx.nativeIds, [])
  const second = context()
  await runZCodeTurn(second, launcher(['{"type":"result","sessionId":"sess_1","response":"done"}', '{"type":"turn.started"}']))
  assert.equal(second.events.at(-1)?.stopReason, 'error')
})

test('restricted policies and cancelled turns never launch a CLI process', async () => {
  const launch = (() => assert.fail('must not spawn')) as unknown as typeof spawn
  const ctx = { ...context(), toolPolicy: 'consult-readonly' }
  await runZCodeTurn(ctx, launch)
  assert.equal(ctx.events.at(-1)?.stopReason, 'error')
  const controller = new AbortController(); controller.abort()
  const cancelled = { ...context(), signal: controller.signal }
  await runZCodeTurn(cancelled, launch)
  assert.equal(cancelled.events.at(-1)?.stopReason, 'interrupted')
})

test('native turn limits and native cancellation do not become success on a zero exit', async () => {
  for (const resultType of ['error_max_turns', 'cancelled']) {
    const ctx = context()
    await runZCodeTurn(ctx, launcher([
      JSON.stringify({ type: 'turn.completed', sessionId: 'sess_owned', payload: { resultType } }),
      JSON.stringify({ type: 'result', sessionId: 'sess_owned', response: 'partial' }),
    ]))
    assert.equal(ctx.events.at(-1)?.stopReason, resultType === 'cancelled' ? 'interrupted' : 'error')
    assert.equal(ctx.events.some(event => event.type === 'assistantSnapshot'), false)
  }
})

test('active cancellation waits for the owned process to close before publishing a terminal result', async () => {
  const controller = new AbortController()
  const ctx = { ...context(), signal: controller.signal }
  const child = new EventEmitter() as ChildProcess
  let killed = false
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => { killed = true; return true } })
  const pending = runZCodeTurn(ctx, (() => child) as unknown as typeof spawn)
  controller.abort()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(killed, true)
  assert.equal(ctx.events.some(event => event.type === 'result'), false)
  child.emit('close', 1)
  await pending
  assert.equal(ctx.events.at(-1)?.stopReason, 'interrupted')
})
