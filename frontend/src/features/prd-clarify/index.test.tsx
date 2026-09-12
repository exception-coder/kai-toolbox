import { describe, expect, it } from 'vitest'
import manifest from './index'

describe('prd clarify feature manifest', () => {
  it('keeps the legacy route while removing the standalone product menu', () => {
    expect(manifest.chrome).toBe(true)
    expect(manifest.routes.map(route => route.path)).toContain('/tools/prd-clarify')
  })
})
