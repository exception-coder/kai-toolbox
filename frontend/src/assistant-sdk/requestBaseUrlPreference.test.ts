import { afterEach, describe, expect, it } from 'vitest'

import {
  readAssistantRequestBaseUrlPreference,
  validateAssistantUserRequestBaseUrl,
  writeAssistantRequestBaseUrlPreference,
} from './requestBaseUrlPreference'

afterEach(() => localStorage.clear())

describe('assistant request base URL preference', () => {
  it('stores a normalized origin per app id', () => {
    writeAssistantRequestBaseUrlPreference('ERP / 中国', 'http://10.10.8.20:8080/path?q=1')

    expect(readAssistantRequestBaseUrlPreference('ERP / 中国')).toBe('http://10.10.8.20:8080')
    expect(readAssistantRequestBaseUrlPreference('SCM')).toBeUndefined()
  })

  it('removes the browser override when restoring the default', () => {
    writeAssistantRequestBaseUrlPreference('ERP', 'https://forge.example.com')
    writeAssistantRequestBaseUrlPreference('ERP')

    expect(readAssistantRequestBaseUrlPreference('ERP')).toBeUndefined()
  })

  it('rejects an HTTP request origin from an HTTPS host page', () => {
    expect(() => validateAssistantUserRequestBaseUrl('http://10.10.8.20:8080', 'https:'))
      .toThrow('请填写 HTTPS 内网地址或使用同源代理')
  })
})
