import { describe, expect, it } from 'vitest'
import { normalizeAssistantRequestBaseUrl, resolveAssistantConnectionOptions } from './requestBaseUrl'

describe('assistant request base URL', () => {
  it('derives websocket and login endpoints from an intranet origin', () => {
    expect(resolveAssistantConnectionOptions({
      appId: 'ERP',
      requestBaseUrl: 'http://10.10.8.20:8080/some/path?ignored=true',
      externalLogin: {},
    })).toEqual({
      requestBaseUrl: 'http://10.10.8.20:8080',
      wsUrl: 'ws://10.10.8.20:8080/api/claude-chat/consult/ws',
      externalLogin: { loginUrl: 'http://10.10.8.20:8080/api/auth/external-login' },
    })
  })

  it('keeps explicit legacy endpoints authoritative', () => {
    const connection = resolveAssistantConnectionOptions({
      appId: 'ERP',
      requestBaseUrl: 'https://forge.example.com',
      wsUrl: 'wss://ws.example.com/custom',
      externalLogin: { loginUrl: 'https://login.example.com/session' },
    })
    expect(connection.wsUrl).toBe('wss://ws.example.com/custom')
    expect(connection.externalLogin?.loginUrl).toBe('https://login.example.com/session')
  })

  it('rejects unsupported protocols before any request starts', () => {
    expect(() => normalizeAssistantRequestBaseUrl('file:///tmp/forge')).toThrow('仅支持 HTTP(S)')
  })

  it('requires a request origin when login URL is omitted', () => {
    expect(() => resolveAssistantConnectionOptions({ appId: 'ERP', externalLogin: {} }))
      .toThrow('需要 requestBaseUrl 或 externalLogin.loginUrl')
  })
})
