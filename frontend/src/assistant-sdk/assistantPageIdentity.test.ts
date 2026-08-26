import { describe, expect, it } from 'vitest'
import { resolveAssistantPageIdentity } from './assistantPageIdentity'

describe('resolveAssistantPageIdentity', () => {
  it('keeps business parameters, sorts them and removes secrets and fragments', () => {
    const identity = resolveAssistantPageIdentity(' SCM ', {
      url: '/new-product-progress.action?style=25D332&access_token=secret&factory=MW25#table',
    }, 'https://scm.example.com/home')

    expect(identity).toEqual({
      appId: 'SCM',
      pageKey: 'https://scm.example.com/new-product-progress.action?factory=MW25&style=25D332',
      pageUrl: 'https://scm.example.com/new-product-progress.action?factory=MW25&style=25D332',
    })
  })

  it('returns the same key for query parameters in a different order', () => {
    const first = resolveAssistantPageIdentity('ERP', { url: '/orders?b=2&a=1' }, 'https://erp.example.com')
    const second = resolveAssistantPageIdentity('ERP', { url: '/orders?a=1&b=2' }, 'https://erp.example.com')

    expect(first?.pageKey).toBe(second?.pageKey)
  })
})
