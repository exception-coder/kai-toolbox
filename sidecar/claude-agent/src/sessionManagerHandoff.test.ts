import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Session, SessionManager } from './sessionManager.js'
import { SessionModelSync } from './sessionModelSync.js'
import { runCodexTurn } from './codexEngine.js'
import type { EngineCatalog } from './engine/engineCatalog.js'

test('isolated handoffs preserve source until commit and restore each native handle on round trips', async () => {
  const events: Record<string, unknown>[] = []
  const manager = new SessionManager((_id, event) => events.push(event),
    { selectableNow: () => true } as unknown as EngineCatalog)
  const source = new Session('forge', process.cwd(), event => events.push(event))
  source.engine = 'codex'
  source.sdkSessionId = 'codex-native'
  const sessions = (manager as unknown as { sessions: Map<string, Session> }).sessions
  sessions.set('forge', source)
  const observed: Array<{ engine: string; handle?: string; policy: string }> = []
  const run = mock.method(Session.prototype, 'runTurn', async function(this: Session, prompt: string) {
    assert.notEqual(this, source)
    assert.equal(this.strictNativeResume, true)
    if (this.engine === 'codex') {
      assert.equal(this.codexHandoffConfirmation, true)
      assert.equal(this.apiBaseUrl, undefined)
      assert.equal(this.authToken, undefined)
    }
    observed.push({ engine: this.engine, handle: this.sdkSessionId, policy: this.toolPolicy })
    this.sdkSessionId ??= `${this.engine}-native`
    const emit = (this as unknown as { emitRaw: (event: Record<string, unknown>) => void }).emitRaw
    emit({ type: 'assistantDelta', text: `FORGE_HANDOFF_ACK:${prompt}` })
    emit({ type: 'result', stopReason: 'end_turn' })
  })
  source.apiBaseUrl = 'https://source-provider.invalid'
  source.authToken = 'fixture-only'
  const models = mock.method(SessionModelSync.prototype, 'emitCachedModels', () => {})
  try {
    for (const [index, engine] of ['claude', 'pi', 'codex', 'claude'].entries()) {
      const before: string = source.engine
      const native = index >= 2 ? `${engine}-native` : undefined
      await manager.prepareEngineHandoff('forge', String(index), engine, native, String(index))
      assert.equal(source.engine, before)
      const receipt = events.at(-1)!
      assert.equal(receipt.type, 'engineHandoffPrepared')
      assert.equal(receipt.sdkSessionId, `${engine}-native`)
      manager.switchEngine('forge', engine, String(receipt.sdkSessionId))
      assert.equal(source.engine, engine)
    }
    assert.deepEqual(observed, [
      { engine: 'claude', handle: undefined, policy: 'disabled' },
      { engine: 'pi', handle: undefined, policy: 'disabled' },
      { engine: 'codex', handle: 'codex-native', policy: 'review-only' },
      { engine: 'claude', handle: 'claude-native', policy: 'disabled' },
    ])
  } finally { run.mock.restore(); models.mock.restore(); await source.dispose() }
})

test('Codex handoff reaches native confirmation in a project directory with text-only restrictions', async () => {
  const events: Record<string, unknown>[] = []
  const ctx = {
    cwd: process.cwd(), text: 'handoff', sdkSessionId: 'codex-native',
    toolPolicy: 'review-only', permissionMode: 'bypassPermissions',
    signal: new AbortController().signal, emit: (event: Record<string, unknown>) => events.push(event),
    setSdkSessionId() {},
  }
  let reachedNative = false
  const runNative: NonNullable<Parameters<typeof runCodexTurn>[1]> = async options => {
    reachedNative = true
    assert.equal(options.cwd, ctx.cwd)
    assert.equal(options.threadId, ctx.sdkSessionId)
    assert.equal(options.sandbox, 'read-only')
    assert.equal(options.approvalPolicy, 'never')
    assert.equal(options.forbidMcpTools, true)
    assert.equal(options.config?.web_search, 'disabled')
    assert.equal(options.config?.project_doc_max_bytes, 0)
    const features = options.config?.features as Record<string, unknown>
    for (const tool of ['shell_tool', 'unified_exec', 'hooks', 'browser_use', 'plugins']) {
      assert.equal(features[tool], false)
    }
  }
  await runCodexTurn(ctx, runNative)
  assert.equal(events[0]?.code, 'REVIEW_WORKSPACE_FORBIDDEN')
  assert.equal(reachedNative, false)
  await runCodexTurn({ ...ctx, handoffConfirmation: true }, runNative)
  assert.equal(reachedNative, true)
})
