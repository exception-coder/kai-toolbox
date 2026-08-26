import { describe, expect, it, vi } from 'vitest'

import { AssistantExternalLoginClient } from './externalLogin'

describe('AssistantExternalLoginClient', () => {
  it('restores a valid access token within the current tab session', async () => {
    const storage = createStorage()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      accessToken: 'forge-access', refreshToken: 'must-not-be-retained', expiresIn: 1800,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const options = { loginUrl: 'https://forge.example.com/api/auth/external-login' }
    const client = new AssistantExternalLoginClient(options, fetcher, storage)

    await client.login('tester', 'secret')

    expect(fetcher).toHaveBeenCalledWith('https://forge.example.com/api/auth/external-login', expect.objectContaining({
      method: 'POST', mode: 'cors', credentials: 'omit', body: JSON.stringify({ username: 'tester', password: 'secret' }),
    }))
    expect(client.requireAccessToken()).toBe('forge-access')
    expect(new AssistantExternalLoginClient(options, fetcher, storage).requireAccessToken()).toBe('forge-access')
    expect(storage.dump()).not.toContain('must-not-be-retained')
  })

  it('clears an expired tab session instead of restoring it', () => {
    const storage = createStorage(JSON.stringify({ accessToken: 'expired', expiresAt: Date.now() - 1 }))
    const client = new AssistantExternalLoginClient(
      { loginUrl: 'https://forge.example.com/api/auth/external-login' }, vi.fn(), storage,
    )

    expect(client.isAuthenticated()).toBe(false)
    expect(storage.dump()).toBe('')
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

function createStorage(initialValue?: string) {
  const values = new Map<string, string>()
  if (initialValue) values.set('kai-assistant:external-login:https://forge.example.com/api/auth/external-login', initialValue)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    dump: () => [...values.values()].join(''),
  }
}
