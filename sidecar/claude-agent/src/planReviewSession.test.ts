import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPlanReviewSession, PLAN_REVIEW_ENGINES } from './planReviewSession.js'
import { buildCodexDeveloperInstructions } from './codexEngine.js'

test('all supported review engines use fresh native identities and restrictive policies', async () => {
  for (const engine of PLAN_REVIEW_ENGINES) {
    const candidate = createPlanReviewSession({ requestId: 'attempt', engine, cwd: process.cwd(), codexHome: 'private-home' }, () => {})
    assert.equal(candidate.engine, engine)
    assert.equal(candidate.sdkSessionId, undefined)
    assert.equal(candidate.strictNativeResume, true)
    assert.equal(candidate.forgeSqlRegistration, false)
    assert.equal(candidate.toolPolicy, engine === 'codex' ? 'review-only' : 'disabled')
    assert.equal(candidate.codexHome, 'private-home')
    await candidate.dispose()
  }
  for (const engine of ['unknown', 'trae', 'antigravity']) {
    assert.throws(() => createPlanReviewSession({ requestId: 'x', engine, cwd: '.' }, () => {}))
  }
  const instructions = buildCodexDeveloperInstructions('review-only', 'plan-review:attempt')
  assert.match(instructions ?? '', /内部技术方案文字评审/)
  assert.doesNotMatch(instructions ?? '', /不得输出源码文件/)
})
