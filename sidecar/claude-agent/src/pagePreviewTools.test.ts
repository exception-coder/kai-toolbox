import assert from 'node:assert/strict'
import { test } from 'node:test'
import { preparePagePreview } from './pagePreviewTools.js'

test('preview handoff is stable, credential-free and does not claim a rendered page', () => {
  const args = { route: '/tools/fore-consult?example=1', device: 'phone' as const, scene: 'consult-image' as const, sourceRevision: 'abc123' }
  const result = preparePagePreview(args, 'session')
  assert.equal(result.structuredContent.status, 'WAITING_VIEWER_AUTH')
  assert.equal(result.structuredContent.viewerPath, preparePagePreview(args, 'session').structuredContent.viewerPath)
  const url = new URL(result.structuredContent.viewerPath, 'https://forge.example')
  assert.equal(url.searchParams.get('route'), args.route)
  assert.equal(url.searchParams.get('device'), 'phone')
  assert.equal(url.searchParams.get('auto'), '1')
  assert.equal(url.searchParams.has('access_token'), false)
})
test('preview handoff rejects external and credential-bearing paths', () => {
  for (const route of ['https://evil.example', '//evil.example', '/?password=x', '/?access_token=x']) {
    assert.throws(() => preparePagePreview({ route, device: 'desktop', scene: 'page' }))
  }
})
