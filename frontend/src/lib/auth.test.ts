import { beforeEach, describe, expect, it, vi } from 'vitest'

const TOKEN_KEY = 'toolbox.auth.token'
const REFRESH_KEY = 'toolbox.auth.refresh'
const EXPIRES_KEY = 'toolbox.auth.expiresAt'

function seedAuth(accessToken = 'access-old', refreshToken = 'refresh-old') {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  localStorage.setItem(EXPIRES_KEY, String(Date.now() - 1))
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('shared authentication refresh', () => {
  it('syncs the in-memory token snapshot after another window updates storage', async () => {
    seedAuth()
    const auth = await import('./auth')
    expect(auth.getToken()).toBe('access-old')

    localStorage.setItem(TOKEN_KEY, 'access-new')
    window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, newValue: 'access-new' }))

    expect(auth.getToken()).toBe('access-new')
  })

  it('reads the latest shared token before the storage event is delivered', async () => {
    seedAuth()
    const auth = await import('./auth')

    localStorage.setItem(TOKEN_KEY, 'access-new')

    expect(auth.getToken()).toBe('access-new')
    expect(auth.withAuthToken('/api/media')).toBe('/api/media?access_token=access-new')
  })

  it('reuses a token refreshed by another window instead of force-refreshing again', async () => {
    seedAuth('access-new', 'refresh-new')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const auth = await import('./auth')

    await auth.ensureFreshToken(true, 'access-old')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(auth.getToken()).toBe('access-new')
  })

  it('does not log out when a stale refresh request gets 401 after another window succeeds', async () => {
    seedAuth()
    vi.stubGlobal('fetch', vi.fn(async () => {
      localStorage.setItem(TOKEN_KEY, 'access-new')
      localStorage.setItem(REFRESH_KEY, 'refresh-new')
      return new Response(null, { status: 401 })
    }))
    const auth = await import('./auth')

    await auth.ensureFreshToken(true, 'access-old')

    expect(localStorage.getItem(TOKEN_KEY)).toBe('access-new')
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-new')
    expect(auth.getToken()).toBe('access-new')
  })

  it('does not overwrite a newer login with a stale successful refresh response', async () => {
    seedAuth()
    vi.stubGlobal('fetch', vi.fn(async () => {
      localStorage.setItem(TOKEN_KEY, 'access-login')
      localStorage.setItem(REFRESH_KEY, 'refresh-login')
      return new Response(JSON.stringify({
        accessToken: 'access-stale',
        refreshToken: 'refresh-stale',
        tokenType: 'Bearer',
        expiresIn: 1800,
        user: { userId: 2, username: 'admin', roles: ['ADMIN'] },
        permissionCodes: [],
        superAdmin: true,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const auth = await import('./auth')

    await auth.ensureFreshToken(true, 'access-old')

    expect(localStorage.getItem(TOKEN_KEY)).toBe('access-login')
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-login')
  })

  it('deduplicates simultaneous refresh requests in the current window', async () => {
    seedAuth()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      tokenType: 'Bearer',
      expiresIn: 1800,
      user: { userId: 2, username: 'admin', roles: ['ADMIN'] },
      permissionCodes: [],
      superAdmin: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const auth = await import('./auth')

    await Promise.all([
      auth.ensureFreshToken(true, 'access-old'),
      auth.ensureFreshToken(true, 'access-old'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.getToken()).toBe('access-new')
  })
})
