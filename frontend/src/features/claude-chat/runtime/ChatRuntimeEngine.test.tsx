import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ChatRuntimeEngine } from './ChatRuntimeEngine'
import type { EmergencyRepairRequest } from '@/lib/emergencyRepair'
import { loadDrafts, saveDrafts, setDraftFor } from '../lib/draftPref'

const fixture = vi.hoisted(() => ({
  chat: { sessionId: 'old' as string | null, state: 'ready', currentEngine: 'codex', items: [],
    open: vi.fn(), send: vi.fn(), switchTo: vi.fn(), enqueue: vi.fn() },
  status: vi.fn(), handled: vi.fn(), rename: vi.fn(),
}))
vi.mock('../hooks/useClaudeChatSocket', () => ({ useClaudeChatSocket: () => ({ ...fixture.chat }) }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { userId: 1 } }) }))
vi.mock('@/lib/vibeEntryDiagnostics', () => ({ reportVibeEntry: vi.fn() }))
vi.mock('@/lib/emergencyRepair', () => ({ publishEmergencyRepairStatus: fixture.status }))
vi.mock('../api', () => ({ getSelfRepo: async () => ({ exists: true, path: 'D:/repo' }),
  listSessions: async () => [], renameSession: fixture.rename }))

const request: EmergencyRepairRequest = { id: 'repair', featureId: 'claude-chat', route: '/tools/claude-chat',
  errorName: 'Error', errorMessage: 'load failed', requestedAt: 1 }
function view() {
  return <MemoryRouter><ChatRuntimeEngine onChat={() => {}} demo={false} emergencyRepair={request}
    onEmergencyRepairHandled={fixture.handled} /></MemoryRouter>
}
beforeEach(() => {
  localStorage.clear()
  saveDrafts({})
  vi.clearAllMocks()
  fixture.chat.sessionId = 'old'
  fixture.chat.state = 'ready'
  fixture.chat.send.mockReturnValue(true)
  fixture.rename.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

it('dispatches an initial prompt only after the new session becomes ready', async () => {
  const mounted = render(view())
  await waitFor(() => expect(fixture.chat.open).toHaveBeenCalledTimes(1))
  expect(fixture.chat.send).not.toHaveBeenCalled()
  fixture.chat.sessionId = 'new'
  fixture.chat.state = 'connecting'
  mounted.rerender(view())
  expect(fixture.chat.send).not.toHaveBeenCalled()
  fixture.chat.state = 'ready'
  mounted.rerender(view())
  await waitFor(() => expect(fixture.chat.send).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('故障模块：claude-chat'), undefined, expect.stringContaining('紧急修复')))
})

it('preserves a rejected initial prompt alongside the current draft', async () => {
  fixture.chat.send.mockReturnValue(false)
  const mounted = render(view())
  await waitFor(() => expect(fixture.chat.open).toHaveBeenCalledTimes(1))
  setDraftFor('new', '已有草稿')
  fixture.chat.sessionId = 'new'
  mounted.rerender(view())
  await waitFor(() => expect(loadDrafts().new).toContain('已有草稿\n\n这是 kai-toolbox'))
  expect(fixture.status).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'failed', message: expect.stringContaining('原文已保留') }))
})
