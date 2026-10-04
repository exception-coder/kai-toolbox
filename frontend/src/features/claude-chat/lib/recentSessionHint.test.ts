import { beforeEach, expect, it, vi } from 'vitest'
import { clearRecentSessionHint, readRecentSessionHint, saveRecentSessionHint } from './recentSessionHint'

beforeEach(() => { localStorage.clear(); vi.useRealTimers() })

it('restores a recent session id without persisting its content', () => {
  saveRecentSessionHint(1, 'session-1')
  expect(readRecentSessionHint(1)).toBe('session-1')
  expect(readRecentSessionHint(2)).toBeNull()
  expect(localStorage.getItem('kai-toolbox:claude-chat:recent-session:1')).not.toContain('message')
  clearRecentSessionHint(1)
  expect(readRecentSessionHint(1)).toBeNull()
})

it('ignores expired or malformed hints', () => {
  localStorage.setItem('kai-toolbox:claude-chat:recent-session:1', '{bad')
  expect(readRecentSessionHint(1)).toBeNull()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T00:00:00Z'))
  saveRecentSessionHint(1, 'old')
  vi.setSystemTime(new Date('2026-10-12T00:00:00Z'))
  expect(readRecentSessionHint(1)).toBeNull()
})
