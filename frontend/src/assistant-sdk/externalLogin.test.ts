import { describe, expect, it, vi } from 'vitest'

import { AssistantExternalLoginClient } from './externalLogin'

describe('AssistantExternalLoginClient', () => {
  it('keeps only the access token in memory after a successful Forge login', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      accessToken: 'forge-access', refreshToken: 'must-not-be-retained', expiresIn: 1800,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const client = new AssistantExternalLoginClient({ loginUrl: 'https://forge.example.com/api/auth/external-login' }, fetcher)

    await client.login('tester', 'secret')

    expect(fetcher).toHaveBeenCalledWith('https://forge.example.com/api/auth/external-login', expect.objectContaining({
      method: 'POST', mode: 'cors', credentials: 'omit', body: JSON.stringify({ username: 'tester', password: 'secret' }),
    }))
    expect(client.requireAccessToken()).toBe('forge-access')
    client.clear()
    expect(() => client.requireAccessToken()).toThrow('请重新登录')
  })

  it('does not retain authentication after invalid credentials', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: 'bad credentials' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    }))
    const client = new AssistantExternalLoginClient({ loginUrl: 'https://forge.example.com/api/auth/external-login' }, fetcher)

    await expect(client.login('tester', 'wrong')).rejects.toThrow('Forge 账号或密码不正确')
    expect(client.isAuthenticated()).toBe(false)
  })

  it('rejects a successful response without a valid access token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ refreshToken: 'refresh', expiresIn: 1800 }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    const client = new AssistantExternalLoginClient({ loginUrl: 'https://forge.example.com/api/auth/external-login' }, fetcher)

    await expect(client.login('tester', 'secret')).rejects.toThrow('缺少有效的 ACCESS Token')
  })
})
