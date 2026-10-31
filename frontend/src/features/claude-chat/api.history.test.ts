import { afterEach, expect, it, vi } from 'vitest'
import { http } from '@/lib/api'
import { loadMessages } from './api'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))
vi.mock('@/lib/vibeEntryDiagnostics', () => ({ reportVibeEntry: vi.fn() }))
afterEach(() => vi.resetAllMocks())

it('reads a registered session before its native handle is available', async () => {
  vi.mocked(http).mockResolvedValue({ items: [], nextBefore: null })
  await loadMessages(null, '', null, 30, 'logical')
  expect(vi.mocked(http).mock.calls[0][0]).toBe('/claude-chat/history/sessions/logical/messages?pagination=cursor&limit=30&sessionId=logical')
  await expect(loadMessages(null, '', null)).rejects.toThrow('会话 ID')
  expect(http).toHaveBeenCalledTimes(1)
})

it('opts into byte cursors and passes opaque continuation without converting it into an index', async () => {
  vi.mocked(http).mockResolvedValue({ items: [], nextBefore: null, nextCursor: 'opaque-cursor' })
  expect((await loadMessages('native', 'D:/project', null, 30, 'logical')).nextBefore).toBe('opaque-cursor')
  expect(vi.mocked(http).mock.calls[0][0]).toContain('pagination=cursor')
  expect(vi.mocked(http).mock.calls[0][0]).toContain('sessionId=logical')
  await loadMessages('native', 'D:/project', 'opaque-cursor', 30, 'logical')
  expect(vi.mocked(http).mock.calls[1][0]).toContain('cursor=opaque-cursor')
  expect(vi.mocked(http).mock.calls[1][0]).not.toContain('before=')
})

it('continues supporting old server and non-Codex integer pages', async () => {
  vi.mocked(http).mockResolvedValue({ items: [], nextBefore: 30 })
  expect((await loadMessages('native', '', null)).nextBefore).toBe(30)
  await loadMessages('native', '', 30)
  expect(vi.mocked(http).mock.calls[1][0]).toContain('before=30')
})
