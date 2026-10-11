import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSessionStorage } from '../api'
import { CurrentSessionStorage } from '../components/CurrentSessionStorage'
import type { ClaudeChatSessionView, SessionStorageView } from '../types'
import { useSessionStorage } from './useSessionStorage'
import { storageLabel } from '../lib/sessionStorage'

const auth = vi.hoisted(() => ({ user: { userId: 1 } as { userId: number } | null }))
vi.mock('@/lib/auth', () => ({ useAuth: () => auth }))
vi.mock('../api', () => ({ fetchSessionStorage: vi.fn() }))
const read = vi.mocked(fetchSessionStorage)
const clients: QueryClient[] = []
const session = (id: string, codexHome = 'account-a'): ClaudeChatSessionView => ({
  id, codexHome, cwd: 'D:/work', title: id, sdkSessionId: id, engine: 'codex', status: 'IDLE', live: false,
  startedAt: 1, lastSeenAt: 1,
})
const record = (sessionId: string, bytes: number, status: SessionStorageView['status'] = 'available'): SessionStorageView => ({
  sessionId, bytes, status, fileCount: 1, checkedAt: 1000, description: '本地原生记录', engines: [],
})

function mount(value: ClaudeChatSessionView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const element = (next: ClaudeChatSessionView) => <QueryClientProvider client={client}><CurrentSessionStorage session={next} /></QueryClientProvider>
  return { element, ...render(element(value)) }
}

beforeEach(() => { auth.user = { userId: 1 } })
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks() })

describe('session record metadata', () => {
  it('does not project a late response from the previous session onto the selected session', async () => {
    let finishAlpha!: (value: SessionStorageView[]) => void
    read.mockImplementation(ids => ids[0] === 'alpha'
      ? new Promise(resolve => { finishAlpha = resolve }) : Promise.resolve([record('beta', 4096)]))
    const view = mount(session('alpha'))
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    view.rerender(view.element(session('beta')))
    await screen.findByText('记录 4 KB')
    finishAlpha([record('alpha', 1024)])
    await waitFor(() => expect(screen.getByText('记录 4 KB')).toBeInTheDocument())
    expect(screen.queryByText('记录 1 KB')).not.toBeInTheDocument()
    expect(read.mock.calls.every(([, signal]) => signal instanceof AbortSignal)).toBe(true)
  })

  it('isolates account directories and users, exposes partial values, and marks failed refreshes as old data', async () => {
    read.mockResolvedValue([record('same', 2048)])
    const view = mount(session('same'))
    await screen.findByText('记录 2 KB')
    read.mockResolvedValue([record('same', 8192, 'partial')])
    view.rerender(view.element(session('same', 'account-b')))
    expect(screen.queryByText('记录 2 KB')).not.toBeInTheDocument()
    await screen.findByText('部分已知 8 KB')
    auth.user = { userId: 2 }
    read.mockResolvedValue([record('same', 0)])
    view.rerender(view.element(session('same', 'account-b')))
    await screen.findByText('记录 0 B')
    read.mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: '刷新当前会话记录大小' }))
    await screen.findByText('记录 0 B · 旧数据')
    expect(screen.getByText(/更新失败，当前显示上次读取的结果/)).toBeInTheDocument()
    expect(storageLabel({ ...record('unknown', 0), status: 'unsupported', bytes: null })).toBe('记录暂无法获取')
  })

  it('batches visible identities within the API limit instead of reading each row separately', async () => {
    const sessions = Array.from({ length: 101 }, (_, index) => session(String(index)))
    read.mockImplementation(async ids => ids.map(id => record(id, 10)))
    function List() {
      const { values } = useSessionStorage(sessions)
      return <div>{[...values.values()].filter(state => state.value).length} 已读取</div>
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    clients.push(client)
    render(<QueryClientProvider client={client}><List /></QueryClientProvider>)
    await screen.findByText('101 已读取')
    expect(read.mock.calls.map(([ids]) => ids.length)).toEqual([100, 1])
  })
})
