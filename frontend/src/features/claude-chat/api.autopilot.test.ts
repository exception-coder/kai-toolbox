import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  emitSessionExpired: vi.fn(),
  ensureFreshToken: vi.fn().mockResolvedValue(undefined),
  withAuthToken: (path: string) => path,
}))

import { getSessionAutopilot } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('getSessionAutopilot', () => {
  it('requests the canonical API path exactly once', async () => {
    const run = { id: 'run-1', sessionId: 'session/one' }
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(run),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSessionAutopilot('session/one')).resolves.toEqual(run)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/claude-chat/sessions/session%2Fone/autopilot',
      expect.objectContaining({ headers: {} }),
    )
  })

  it('returns null when the session has no autopilot run', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, ok: true } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSessionAutopilot('session-1')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/claude-chat/sessions/session-1/autopilot',
      expect.any(Object),
    )
  })
})
