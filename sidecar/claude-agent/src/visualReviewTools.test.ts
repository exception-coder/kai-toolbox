import test from 'node:test'
import assert from 'node:assert/strict'
import { callVisualReview, visualReviewSchema } from './visualReviewTools.js'
import { z } from 'zod'

test('visual-review MCP boundary does not allow model-supplied session, commands or data directories', async () => {
  const schema = z.object(visualReviewSchema).strict()
  assert.equal(schema.safeParse({ action: 'start', sessionId: 'other' }).success, false)
  assert.equal(schema.safeParse({ action: 'status', command: 'anything' }).success, false)
  assert.equal((await callVisualReview({ action: 'start' })).isError, true)
  // Exercises the fixed CJS module resolution without launching Chrome or uploading a screenshot.
  const result = await callVisualReview({ action: 'start' }, 'visual-review-no-upload-test')
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /授权原话/)
})
