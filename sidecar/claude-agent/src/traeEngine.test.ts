import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess, spawn } from 'node:child_process'
import { parseTraeLine, runTraeTurn, supportsTraeExecJsonl, traeExecArgs } from './traeEngine.js'

test('TraeCode CLI 2.0 capability probe accepts the official 0.x binary version', () => {
  assert.equal(supportsTraeExecJsonl('0.206.1', 'exec --json', 'exec resume SESSION_ID'), true)
  assert.equal(supportsTraeExecJsonl('0.206.1', 'exec', 'resume SESSION_ID'), false)
})

test('Trae uses only an explicitly bound native session and safe default sandbox', () => {
  assert.deepEqual(traeExecArgs({ permissionMode: 'default' }), [
    'exec', '--json', '--color', 'never', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--ask-for-approval', 'never', '-',
  ])
  const resume = traeExecArgs({ permissionMode: 'plan', sdkSessionId: 'owned-thread' })
  assert.deepEqual(resume.slice(0, 10), ['--sandbox', 'read-only', '--ask-for-approval', 'never',
    'exec', 'resume', '--json', '--skip-git-repo-check', '--permission-mode', 'plan'])
  assert.deepEqual(resume.slice(-2), ['owned-thread', '-'])
  assert.equal(resume.includes('--last'), false)
  assert.ok(traeExecArgs({ permissionMode: 'plan' }).includes('read-only'))
  assert.ok(traeExecArgs({ permissionMode: 'bypassPermissions' }).includes('danger-full-access'))
})

test('Trae JSONL parser accepts native session and final assistant message', () => {
  assert.equal(parseTraeLine('{"type":"thread.started","thread_id":"t-1"}').sessionId, 't-1')
  assert.equal(parseTraeLine('{"type":"item.completed","item":{"type":"agent_message","text":"完成"}}').text, '完成')
  assert.equal(parseTraeLine('{"type":"turn.failed","message":"登录失效"}').error, '登录失效')
  assert.deepEqual(parseTraeLine('{"type":"item.started","item":{"id":"call-1","type":"command_execution","command":"pwd"}}').tool,
    { phase: 'started', id: 'call-1', name: 'command_execution', input: { command: 'pwd', path: undefined },
      output: undefined, isError: false })
})

test('Trae adapter emits one final answer and never resumes an unrelated latest thread', async () => {
  const events: Array<Record<string, unknown>> = []
  const nativeIds: string[] = []
  const child = new EventEmitter() as ChildProcess
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true })
  let args: string[] = []
  const launch = ((_command: string, passed: string[]) => {
    args = passed
    queueMicrotask(() => {
      (child.stdout as PassThrough).write('{"type":"thread.started","thread_id":"owned-thread"}\n')
      ;(child.stdout as PassThrough).write('{"type":"item.completed","item":{"type":"agent_message","text":"已完成"}}\n')
      child.emit('close', 0)
    })
    return child
  }) as typeof spawn
  await runTraeTurn({ text: 'hello', cwd: process.cwd(), permissionMode: 'default',
    signal: new AbortController().signal, emit: event => events.push(event),
    setSdkSessionId: id => nativeIds.push(id) }, launch)
  assert.equal(args.includes('--resume'), false)
  assert.deepEqual(nativeIds, ['owned-thread'])
  assert.equal(events.find(event => event.type === 'assistantSnapshot')?.text, '已完成')
  assert.equal(events.at(-1)?.stopReason, 'end_turn')
})
