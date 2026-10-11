import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSessionStorage, listQueuedMessages, listSessions } from '../api'
import type { ClaudeChatSessionView } from '../types'
import { SessionBoard } from './SessionBoard'

const auth = vi.hoisted(() => ({ user: { userId: 1 } as { userId: number } | null }))
vi.mock('@/lib/auth', () => ({ useAuth: () => auth }))
vi.mock('../api', () => ({ listSessions: vi.fn(), listQueuedMessages: vi.fn(), fetchSessionStorage: vi.fn() }))
const sessionsRead = vi.mocked(listSessions)
const queueRead = vi.mocked(listQueuedMessages)
const clients: QueryClient[] = []

const session = (id: string, fields: Partial<ClaudeChatSessionView> = {}): ClaudeChatSessionView => ({
  id, cwd: 'D:/work/kai-toolbox', title: id, sdkSessionId: id, engine: 'codex', status: 'IDLE', live: false,
  startedAt: 1, lastSeenAt: 1_791_000_000_000, ...fields,
})
const task = (sessionId: string, text: string) => ({ id: `${sessionId}-task`, sessionId, text, createdAt: 1 })

function mount(onOpenSession = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const onNewSession = vi.fn()
  clients.push(client)
  return { client, onOpenSession, onNewSession, ...render(<QueryClientProvider client={client}><SessionBoard currentSessionId={null} onOpenSession={onOpenSession} onNewSession={onNewSession} /></QueryClientProvider>) }
}

beforeEach(() => {
  auth.user = { userId: 1 }
  queueRead.mockResolvedValue([])
  vi.mocked(fetchSessionStorage).mockImplementation(async ids => ids.map(sessionId => ({
    sessionId, status: 'available', bytes: 2048, fileCount: 1, checkedAt: 1, description: '本地原生记录', engines: [],
  })))
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks() })

describe('SessionBoard', () => {
  it('shows queued work for idle sessions, filters within the recent set, and opens the exact target', async () => {
    sessionsRead.mockResolvedValue([session('idle-task'), session('running', { status: 'RUNNING', live: true, lastSeenAt: 1_791_000_000_001 }), session('current')])
    queueRead.mockImplementation(async id => id === 'idle-task' ? [task(id, '修复权限表单并核验')] : [])
    const view = mount()
    await screen.findByText('修复权限表单并核验')
    await waitFor(() => expect(screen.getAllByText('记录 2 KB')).toHaveLength(3))
    expect(screen.getByText('1 条待发送 · 尚未执行')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '进行中 1' }))
    expect(screen.getByRole('button', { name: '进入会话：running' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入会话：idle-task' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '有待发送 1' }))
    fireEvent.click(screen.getByRole('button', { name: '查看会话：idle-task' }))
    expect(view.onOpenSession).toHaveBeenCalledWith('idle-task', false)
    expect(queueRead.mock.calls.every(([, signal]) => signal instanceof AbortSignal)).toBe(true)
  })

  it('keeps failed queues visible under queued filtering and retries only the selected queue', async () => {
    sessionsRead.mockResolvedValue([session('offline'), session('healthy')])
    queueRead.mockImplementation(async id => { if (id === 'offline') throw new Error('offline'); return [] })
    mount()
    await screen.findByText('队列暂无法获取')
    fireEvent.click(screen.getByRole('button', { name: '有待发送 0' }))
    expect(screen.getByRole('button', { name: '进入会话：offline' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入会话：healthy' })).not.toBeInTheDocument()
    expect(screen.queryByText('最近会话中没有待发送任务')).not.toBeInTheDocument()
    queueRead.mockImplementation(async id => id === 'offline' ? [task(id, '恢复后继续验收')] : [])
    fireEvent.click(screen.getByRole('button', { name: '重试队列读取' }))
    await screen.findByText('恢复后继续验收')
    expect(queueRead.mock.calls.filter(([id]) => id === 'healthy')).toHaveLength(1)
  })

  it('does not transfer queue data when activity order or the account changes', async () => {
    sessionsRead.mockResolvedValue([session('alpha', { lastSeenAt: 2 }), session('beta', { lastSeenAt: 1 })])
    queueRead.mockImplementation(async id => [task(id, `${auth.user!.userId}-${id}-工作`)])
    const view = mount()
    await screen.findByText('1-alpha-工作')
    view.client.setQueryData(['claude-chat-sessions', 'board', 1], [session('beta', { lastSeenAt: 3 }), session('alpha', { lastSeenAt: 2 })])
    await waitFor(() => expect(within(screen.getByRole('button', { name: '进入会话：beta' }).closest('li')!).getByText('1-beta-工作')).toBeInTheDocument())
    auth.user = { userId: 2 }
    sessionsRead.mockResolvedValue([session('alpha')])
    view.rerender(<QueryClientProvider client={view.client}><SessionBoard currentSessionId={null} onOpenSession={view.onOpenSession} onNewSession={view.onNewSession} /></QueryClientProvider>)
    await screen.findByText('2-alpha-工作')
    expect(screen.queryByText('1-alpha-工作')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入会话：beta' })).not.toBeInTheDocument()
  })

  it('recovers from an empty list and an empty filter without starting work', async () => {
    sessionsRead.mockResolvedValue([])
    const view = mount()
    await screen.findByText('还没有可查看的开发会话')
    expect(queueRead).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    expect(view.onNewSession).toHaveBeenCalledOnce()
    view.client.setQueryData(['claude-chat-sessions', 'board', 1], [session('idle')])
    await screen.findByRole('button', { name: '进入会话：idle' })
    fireEvent.click(screen.getByRole('button', { name: '进行中 0' }))
    expect(screen.getByText('最近会话中没有正在运行的会话')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看全部最近会话' }))
    expect(screen.getByRole('button', { name: '进入会话：idle' })).toBeInTheDocument()
    expect(view.onOpenSession).not.toHaveBeenCalled()
  })
})
