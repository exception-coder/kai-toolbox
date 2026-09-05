import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUTOPILOT_DISPOSITIONS,
  AUTOPILOT_PROGRESS_TOOL_ANNOTATIONS,
  autopilotProgressPayloadSchema,
} from './autopilotProgressContract.js'

test('accepts all dispositions without accepting caller supplied runtime identity', () => {
  for (const disposition of AUTOPILOT_DISPOSITIONS) {
    const result = autopilotProgressPayloadSchema.safeParse({
      disposition,
      summary: 'bounded progress',
      nextAction: disposition === 'CONTINUE' ? 'continue current task' : undefined,
      reason: ['WAITING_USER', 'BLOCKED', 'FAILED'].includes(disposition) ? 'action required' : undefined,
      sessionId: 'forged-session',
      generation: 99,
      phase: 'DONE',
      taskId: '99.9',
    })
    assert.equal(result.success, true, disposition)
    assert.equal('sessionId' in (result.success ? result.data : {}), false)
    assert.equal('generation' in (result.success ? result.data : {}), false)
    assert.equal('phase' in (result.success ? result.data : {}), false)
    assert.equal('taskId' in (result.success ? result.data : {}), false)
  }
})

test('rejects unsupported disposition and oversized evidence', () => {
  assert.equal(autopilotProgressPayloadSchema.safeParse({ disposition: 'DONE', summary: 'x' }).success, false)
  assert.equal(autopilotProgressPayloadSchema.safeParse({
    disposition: 'CONTINUE', summary: 'x', evidence: Array.from({ length: 21 }, () => 'evidence'),
  }).success, false)
})

test('progress tool is mutating, non-destructive and idempotent', () => {
  assert.deepEqual(AUTOPILOT_PROGRESS_TOOL_ANNOTATIONS, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  })
})
