import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from '@/lib/api'
import { loadProfiles, upsertProfile } from './providerProfiles'
import { ProviderSwitch } from './components/ProviderSwitch'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))

const storageKey = 'kai-toolbox:claude-chat:providers'
const legacy = [{ id: 'p123-abc', name: 'Gateway', baseUrl: 'https://gateway.example', key: 'secret', model: 'model-a' }]
const redacted = [{ id: 'p123-abc', name: 'Gateway', baseUrl: 'https://gateway.example', model: 'model-a', hasKey: true }]

describe('server-owned provider profiles', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(http).mockReset()
  })

  it('imports legacy profiles before loading and removes browser Key only after success', async () => {
    localStorage.setItem(storageKey, JSON.stringify(legacy))
    vi.mocked(http).mockResolvedValueOnce(redacted).mockResolvedValueOnce(redacted)

    expect(await loadProfiles()).toEqual(redacted)
    expect(http).toHaveBeenNthCalledWith(1, '/claude-chat/provider/profiles/import', {
      method: 'POST', body: JSON.stringify(legacy),
    })
    expect(http).toHaveBeenNthCalledWith(2, '/claude-chat/provider/profiles')
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  it('retains the browser copy when import fails so retry is safe', async () => {
    localStorage.setItem(storageKey, JSON.stringify(legacy))
    vi.mocked(http).mockRejectedValueOnce(new Error('network unavailable'))

    await expect(loadProfiles()).rejects.toThrow('network unavailable')
    expect(localStorage.getItem(storageKey)).toBe(JSON.stringify(legacy))
  })

  it('edits a saved profile without reading or resending its existing Key', async () => {
    vi.mocked(http).mockResolvedValueOnce(redacted[0])
    await upsertProfile({ id: 'p123-abc', name: 'Gateway', baseUrl: 'https://gateway.example', key: '', model: 'model-b' })

    expect(http).toHaveBeenCalledWith('/claude-chat/provider/profiles/p123-abc', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Gateway', baseUrl: 'https://gateway.example', key: '', model: 'model-b' }),
    })
  })

  it('switches from the UI by profile ID without sending a Key', async () => {
    vi.mocked(http).mockResolvedValue(redacted)
    const onSwitch = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(createElement(QueryClientProvider, { client }, createElement(ProviderSwitch, {
      engine: 'claude', providerKind: 'official', providerBaseUrl: null, onSwitch,
    })))

    fireEvent.click(screen.getByRole('button', { name: /服务商 官方/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Gateway/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Gateway/ }))
    expect(onSwitch).toHaveBeenCalledWith({ providerProfileId: 'p123-abc', apiBaseUrl: 'https://gateway.example' })
  })
})
