import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SharedSessionPage } from './SharedSessionPage'
import { getSharedMessages, getSharedSession } from '../sessionSharingApi'

vi.mock('../sessionSharingApi', () => ({ getSharedMessages: vi.fn(), getSharedSession: vi.fn(),
  collaborationPath: (id: string) => `/tools/claude-chat?sessionId=${id}&collaboration=1` }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function mount() {
  render(<MemoryRouter initialEntries={['/tools/claude-chat/shared/one']}><Routes>
    <Route path="/tools/claude-chat/shared/:sessionId" element={<SharedSessionPage />} />
    <Route path="/tools/claude-chat" element={<div>原会话工作台</div>} />
  </Routes></MemoryRouter>)
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
  expect(screen.queryByRole('textbox')).toBeNull()
  vi.mocked(getSharedMessages).mockRejectedValue(new Error('当前账号没有权限'))
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('当前账号没有权限')
  expect(screen.queryByText('<script>secret()</script>')).toBeNull()
  expect(screen.getByRole('link', { name: '返回 Vibe Coding' })).toBeTruthy()
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
