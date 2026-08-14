import assert from 'node:assert/strict'
import test from 'node:test'
import { runEphemeralCodexTurn, type CodexTurnCtx, type EphemeralCodexRuntime } from './codexEngine.js'

function context(overrides: Partial<CodexTurnCtx> = {}): CodexTurnCtx {
  return {
    text: 'classify',
    cwd: process.cwd(),
    permissionMode: 'bypassPermissions',
    codexHome: 'C:\\Users\\tester\\.codex-work',
    signal: new AbortController().signal,
    emit: () => {},
    setSdkSessionId: () => {},
    ...overrides,
  }
}

function runtime(
  runTurn: EphemeralCodexRuntime['runTurn'],
  deleteThread: EphemeralCodexRuntime['deleteThread'],
  warnings: string[] = [],
): EphemeralCodexRuntime {
  return { runTurn, deleteThread, warn: message => warnings.push(message) }
}

test('deletes every native thread created by an ephemeral Codex task', async () => {
  const deleted: Array<[string, string | undefined]> = []
  await runEphemeralCodexTurn(context(), runtime(
    async ctx => {
      ctx.setSdkSessionId('thread-app-server')
      ctx.setSdkSessionId('thread-app-server')
      ctx.setSdkSessionId('thread-sdk-fallback')
    },
    async (threadId, codexHome) => { deleted.push([threadId, codexHome]) },
  ))

  assert.deepEqual(deleted, [
    ['thread-app-server', 'C:\\Users\\tester\\.codex-work'],
    ['thread-sdk-fallback', 'C:\\Users\\tester\\.codex-work'],
  ])
})

test('deletes a captured thread when the one-shot task fails', async () => {
  const deleted: string[] = []
  const failure = new Error('classification failed')

  await assert.rejects(
    runEphemeralCodexTurn(context(), runtime(
      async ctx => {
        ctx.setSdkSessionId('thread-failed')
        throw failure
      },
      async threadId => { deleted.push(threadId) },
    )),
    error => error === failure,
  )
  assert.deepEqual(deleted, ['thread-failed'])
})

test('does not replace a successful result when native thread deletion fails', async () => {
  const warnings: string[] = []

  await runEphemeralCodexTurn(context(), runtime(
    async ctx => { ctx.setSdkSessionId('thread-cleanup-error') },
    async () => { throw new Error('delete unavailable') },
    warnings,
  ))

  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /thread-cleanup-error/)
  assert.match(warnings[0], /delete unavailable/)
})

test('does not call delete when Codex never created a thread', async () => {
  let deleteCalls = 0
  await runEphemeralCodexTurn(context(), runtime(
    async () => {},
    async () => { deleteCalls += 1 },
  ))

  assert.equal(deleteCalls, 0)
})
