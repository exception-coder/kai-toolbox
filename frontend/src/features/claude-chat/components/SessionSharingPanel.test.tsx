import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionSharingPanel } from './SessionSharingPanel'
import { grantSessionReader, listSessionReaders, listSharedSessions, revokeSessionReader, searchSessionRecipients } from '../sessionSharingApi'

vi.mock('../sessionSharingApi', () => ({ grantSessionReader: vi.fn(), listSessionReaders: vi.fn(),
  listSharedSessions: vi.fn(), revokeSessionReader: vi.fn(), searchSessionRecipients: vi.fn(),
  collaborationPath: (id: string) => `/tools/claude-chat?sessionId=${id}&collaboration=1`,
  sharedSessionPath: (id: string) => `/tools/claude-chat/shared/${id}` }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('distinguishes same-name sessions by project and supports legacy missing projects', async () => {
  vi.mocked(listSharedSessions).mockResolvedValue([
    { id: 'a', title: '发布', projectName: '工程甲', engine: 'codex', lastSeenAt: 1 },
    { id: 'b', title: '发布', projectName: '工程乙', engine: 'claude', lastSeenAt: 1, collaborate: true },
    { id: 'c', title: '旧会话', engine: 'codex', lastSeenAt: 1 },
  ])
  render(<MemoryRouter><SessionSharingPanel onClose={vi.fn()} /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: '发布 工程甲 · 只读 · codex' })).toHaveAttribute('href', '/tools/claude-chat/shared/a')
  expect(screen.getByRole('link', { name: '发布 工程乙 · 可继续会话 · claude' })).toHaveAttribute('href', '/tools/claude-chat?sessionId=b&collaboration=1')
  expect(screen.getByRole('link', { name: '旧会话 只读 · codex' })).toBeVisible()
})

it('selects an exact account, grants read access then allows revocation', async () => {
  const recipient = { id: 8, username: 'yanwei', realName: '严伟' }
  vi.mocked(listSessionReaders).mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ ...recipient, expiresAt: Date.now() + 3_600_000 }]).mockResolvedValueOnce([])
  vi.mocked(searchSessionRecipients).mockResolvedValue([recipient])
  vi.mocked(grantSessionReader).mockResolvedValue(undefined)
  vi.mocked(revokeSessionReader).mockResolvedValue(undefined)
  render(<MemoryRouter><SessionSharingPanel sessionId="one" sessionTitle="生产发版" onClose={vi.fn()} /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: '共享会话 · 生产发版' })).toBeTruthy()
  fireEvent.change(await screen.findByLabelText('用户名或姓名'), { target: { value: '严伟' } })
  expect(screen.getByRole('button', { name: '复制共享链接' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('查看期限'), { target: { value: '1' } })
  fireEvent.click(await screen.findByRole('button', { name: '授权继续会话' }))
  await waitFor(() => expect(grantSessionReader).toHaveBeenCalledWith('one', 8, 1))
  expect(await screen.findByText(/到期/)).toBeTruthy()
  expect(screen.getByRole('button', { name: '复制共享链接' })).toBeEnabled()
  fireEvent.click(await screen.findByRole('button', { name: '撤回共享' }))
  await waitFor(() => expect(revokeSessionReader).toHaveBeenCalledWith('one', 8))
  expect(await screen.findByText('已撤回共享，接收者无法继续访问')).toBeTruthy()
  expect(screen.getByRole('button', { name: '复制共享链接' })).toBeDisabled()
})

it('does not present a failed grant-list request as no recipients', async () => {
  vi.mocked(listSessionReaders).mockRejectedValue(new Error('网络不可用'))
  render(<MemoryRouter><SessionSharingPanel sessionId="one" onClose={vi.fn()} /></MemoryRouter>)
  expect(await screen.findByText('授权列表尚未确认，请先重试读取。')).toBeVisible()
  expect(screen.getByRole('button', { name: '复制共享链接' })).toBeDisabled()
  expect(screen.queryByText(/尚无有效共享授权/)).not.toBeInTheDocument()
})

it('does not offer link copying for an expired recipient', async () => {
  vi.mocked(listSessionReaders).mockResolvedValue([{ id: 8, username: 'yanw', realName: '严伟', expiresAt: Date.now() - 1000 }])
  render(<MemoryRouter><SessionSharingPanel sessionId="one" onClose={vi.fn()} /></MemoryRouter>)
  expect(await screen.findByText(/尚无有效共享授权/)).toBeVisible()
  expect(screen.getByRole('button', { name: '复制共享链接' })).toBeDisabled()
})
