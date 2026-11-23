import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SharedSessionPage } from './SharedSessionPage'
import { getSharedMessages, getSharedSession, listSharedSessions } from '../sessionSharingApi'
import { ApiError } from '@/lib/api'

vi.mock('../sessionSharingApi', async importOriginal => ({ ...await importOriginal<typeof import('../sessionSharingApi')>(),
  getSharedMessages: vi.fn(), getSharedSession: vi.fn(), listSharedSessions: vi.fn() }))
vi.mock('@/lib/auth', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/auth')>(), useAuth: () => ({ user: { userId: 1 } }) }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function mount() {
  vi.mocked(listSharedSessions).mockImplementation(async () => [
    { id: 'two', title: '另一共享会话', engine: 'claude', lastSeenAt: 2 },
  ])
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/tools/claude-chat/shared/one']}><Routes>
    <Route path="/tools/claude-chat/shared/:sessionId" element={<SharedSessionPage />} />
    <Route path="/tools/claude-chat" element={<div>原会话工作台</div>} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

it('opens the original workbench directly for an authorized collaborator', async () => {
  vi.mocked(getSharedSession).mockResolvedValue({ id: 'one', title: '生产发版', engine: 'codex', lastSeenAt: 1, collaborate: true })
  mount()
  expect(await screen.findByText('原会话工作台')).toBeTruthy()
  expect(getSharedMessages).not.toHaveBeenCalled()
})

it('reads text without executing markup and clears it when access is revoked', async () => {
  vi.mocked(getSharedSession).mockResolvedValue({ id: 'one', title: '授权会话', engine: 'codex', lastSeenAt: 1 })
  vi.mocked(getSharedMessages).mockResolvedValue({ items: [{ id: 'a', kind: 'assistant', text: '<script>secret()</script>', ts: null }],
    nextCursor: null, transcriptMissing: false, historyGap: null })
  mount()
  expect(await screen.findByText('<script>secret()</script>')).toBeTruthy()
  expect(document.querySelector('script')).toBeNull()
  expect(screen.queryByRole('textbox', { name: '消息输入' })).toBeNull()
  expect(screen.getByText('共享会话 · 只读')).toBeVisible()
  expect(screen.getByRole('button', { name: '复制消息' })).toBeVisible()
  vi.mocked(getSharedMessages).mockRejectedValue(new ApiError(403, null, 'SESSION_FORBIDDEN'))
  fireEvent.click(screen.getByRole('button', { name: '更多共享会话选项' }))
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请确认登录账号')
  expect(screen.getByText('无访问权限')).toBeVisible()
  expect(screen.queryByText(/SESSION_FORBIDDEN/)).not.toBeInTheDocument()
  expect(screen.queryByText('<script>secret()</script>')).toBeNull()
  expect(screen.getByRole('link', { name: '返回 Forge 首页' })).toBeTruthy()
})

it('uses the received-share list and clears previous messages before the next permission check resolves', async () => {
  vi.mocked(getSharedSession).mockResolvedValueOnce({ id: 'one', title: '授权会话', engine: 'codex', lastSeenAt: 1 })
    .mockImplementationOnce(() => new Promise(() => {}))
  vi.mocked(getSharedMessages).mockResolvedValue({ items: [{ id: 'a', kind: 'assistant', text: '仅第一会话可见', ts: null }],
    nextCursor: null, transcriptMissing: false, historyGap: null })
  mount()
  expect(await screen.findByText('仅第一会话可见')).toBeVisible()
  const receivedLink = await screen.findByRole('link', { name: /另一共享会话/ })
  expect(screen.queryByRole('link', { name: /授权会话/ })).toBeNull()
  fireEvent.click(receivedLink)
  expect(screen.queryByText('仅第一会话可见')).toBeNull()
  expect(getSharedSession).toHaveBeenLastCalledWith('two')
  expect(getSharedMessages).toHaveBeenCalledTimes(1)
})

it('keeps an opaque cursor on empty filtered pages and prepends older messages', async () => {
  vi.mocked(getSharedSession).mockResolvedValue({ id: 'one', title: null, engine: 'codex', lastSeenAt: 1 })
  vi.mocked(getSharedMessages).mockResolvedValueOnce({ items: [], nextCursor: 'opaque', transcriptMissing: false, historyGap: null })
    .mockResolvedValueOnce({ items: [{ id: 'u', kind: 'user', text: '较早文字', ts: 1 }], nextCursor: null, transcriptMissing: false, historyGap: null })
  mount()
  const older = await screen.findByRole('button', { name: '加载更早消息' })
  fireEvent.click(older)
  expect(await screen.findByText('较早文字')).toBeTruthy()
  await waitFor(() => expect(getSharedMessages).toHaveBeenLastCalledWith('one', 'opaque'))
})
