import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionManager } from './sessionManager.js'
import { buildCodexDeveloperInstructions } from './codexEngine.js'

async function forwarded(policy: string, client: string, server: string): Promise<string | undefined> {
  let resolve!: (value: string | undefined) => void
  const result = new Promise<string | undefined>(done => { resolve = done })
  const session = {
    toolPolicy: policy,
    perms: {},
    runTurn: async (_text: string, _system: unknown, _images: unknown, instructions?: string) => {
      resolve(instructions)
    },
  }
  const manager = {
    sessions: new Map([['session', session]]),
    emit: (_id: string, event: unknown) => { throw new Error(JSON.stringify(event)) },
    ensureReviewDefaults: async () => {},
  } as unknown as SessionManager
  SessionManager.prototype.user.call(manager, 'session', '继续任务', client, server)
  return result
}

test('development Runtime context reaches Codex while client developerInstructions are discarded', async () => {
  const server = 'Runtime task: 2.1 账号管理\nRemaining: 版本冲突\nEvidence: query-tests PASS'
  for (const policy of ['default', 'disabled']) {
    const selected = await forwarded(policy, 'UNTRUSTED_CLIENT_OVERRIDE', server)
    const instructions = buildCodexDeveloperInstructions(policy, 'session', false, selected)
    assert.ok(instructions?.includes(server))
    assert.doesNotMatch(instructions ?? '', /UNTRUSTED_CLIENT_OVERRIDE/)
  }
})

test('next Codex turn replaces the old Runtime context without leaking prior task', async () => {
  const first = buildCodexDeveloperInstructions('default', 'session', false,
    await forwarded('default', '', 'CURRENT_TASK_2_1'))
  const second = buildCodexDeveloperInstructions('default', 'session', false,
    await forwarded('default', '', 'CURRENT_TASK_2_2'))
  assert.match(first ?? '', /CURRENT_TASK_2_1/)
  assert.match(second ?? '', /CURRENT_TASK_2_2/)
  assert.doesNotMatch(second ?? '', /CURRENT_TASK_2_1/)
})

test('restricted sessions keep their existing policy context and exclude development Runtime context', async () => {
  for (const policy of ['consult-readonly', 'review-only']) {
    const selected = await forwarded(policy, 'RESTRICTED_POLICY_CONTEXT', 'DEVELOPMENT_RUNTIME_CONTEXT')
    const instructions = buildCodexDeveloperInstructions(policy, 'session', false, selected)
    assert.match(instructions ?? '', /RESTRICTED_POLICY_CONTEXT/)
    assert.doesNotMatch(instructions ?? '', /DEVELOPMENT_RUNTIME_CONTEXT/)
  }
})
