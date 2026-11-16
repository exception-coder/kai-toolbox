import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Session, SessionManager } from './sessionManager.js'
import { SessionModelSync } from './sessionModelSync.js'
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
    observed.push({ engine: this.engine, handle: this.sdkSessionId, policy: this.toolPolicy })
    this.sdkSessionId ??= `${this.engine}-native`
    const emit = (this as unknown as { emitRaw: (event: Record<string, unknown>) => void }).emitRaw
    emit({ type: 'assistantDelta', text: `FORGE_HANDOFF_ACK:${prompt}` })
    emit({ type: 'result', stopReason: 'end_turn' })
  })
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
