import { describe, expect, it } from 'vitest'
import { isOfficialDeepSeekBaseUrl, isProviderAuthenticationError } from './providerGateway'

describe('provider gateway guidance', () => {
  it('recognizes only the official DeepSeek host', () => {
    expect(isOfficialDeepSeekBaseUrl('https://api.deepseek.com/anthropic')).toBe(true)
    expect(isOfficialDeepSeekBaseUrl('https://api.deepseek.com.evil.example')).toBe(false)
  })

  it('distinguishes invalid credentials from an unavailable catalog', () => {
    expect(isProviderAuthenticationError('DeepSeek API Key 未通过认证')).toBe(true)
    expect(isProviderAuthenticationError('网关返回 HTTP 401：Invalid token')).toBe(true)
    expect(isProviderAuthenticationError('网关返回 HTTP 404')).toBe(false)
  })
})
