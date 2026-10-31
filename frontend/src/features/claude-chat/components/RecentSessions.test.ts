import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import * as api from '../api'
import { getSessionsByDevSessions } from '@/features/prd-clarify/public-api'
import { RecentSessions } from './RecentSessions'
import { recentSessionVisitsKey, recordSessionVisit } from '../lib/recentSessionVisits'
import type { ClaudeChatSessionView } from '../types'

vi.mock('@/features/prd-clarify/public-api', () => ({ getSessionsByDevSessions: vi.fn().mockResolvedValue({}) }))

beforeEach(() => { localStorage.clear(); vi.mocked(getSessionsByDevSessions).mockResolvedValue({}) })
afterEach(cleanup)

function session(id: string, cwd: string, lastSeenAt: number, favorite = false): ClaudeChatSessionView {
  return { id, cwd, lastSeenAt, favorite, engine: 'codex', status: 'IDLE' } as ClaudeChatSessionView
}

describe('recent session navigation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists sessions across projects by explicit visits, preserves scroll and ignores background reordering', async () => {
    const rows = [
      { ...session('a', 'D:/Alpha', 300), title: '任务 a' },
      { ...session('b', 'D:/Alpha', 200), title: '任务 b' },
      { ...session('c', 'D:/Alpha', 100), title: '任务 c' },
      { ...session('other', 'D:/Beta', 500), title: '任务 other' },
    ]
    let serverRows: ClaudeChatSessionView[] = rows
    vi.spyOn(api, 'listSessions').mockImplementation(async () => serverRows)
    const pin = vi.spyOn(api, 'setSessionFavorite').mockResolvedValue(undefined)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onSwitch = vi.fn()
    const view = (current: string) => createElement(QueryClientProvider, { client }, createElement(ConfirmProvider, null,
      createElement(RecentSessions, { currentSessionId: current, onSwitch })))
    const result = render(view('a'))
    const scroll = await screen.findByRole('list', { name: '最近使用的会话' })
    const order = () => within(scroll).getAllByRole('button', { name: /^任务 / }).map(row => row.getAttribute('title')?.split('\n')[0])
    expect(order()).toEqual(['任务 other', '任务 a', '任务 b', '任务 c'])
    expect(screen.queryByRole('region', { name: /^工作目录 / })).not.toBeInTheDocument()
    scroll.scrollTop = 80
    for (const id of ['b', 'c', 'a']) {
      fireEvent.click(within(scroll).getByRole('button', { name: new RegExp('^任务 ' + id) }))
      result.rerender(view(id))
    }
    expect(order()).toEqual(['任务 a', '任务 c', '任务 b', '任务 other'])
    serverRows = [
      { ...session('new', 'D:/Gamma', 2000), title: '任务 new' },
      { ...rows[2], lastSeenAt: 1000, status: 'RUNNING', live: true }, ...rows.slice(0, 2), rows[3],
    ]
    await act(async () => { client.setQueryData(['claude-chat-sessions'], serverRows) })
    await waitFor(() => expect(screen.getByRole('button', { name: '更新最近会话排序' })).toHaveTextContent('有新活动'))
    expect(order()).toEqual(['任务 a', '任务 c', '任务 b', '任务 other'])
    expect(scroll.scrollTop).toBe(80)
    expect(screen.getByRole('button', { name: '更新最近会话排序' })).toHaveTextContent('有新活动')
    expect(pin).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '更新最近会话排序' }))
    expect(order()).toEqual(['任务 a', '任务 c', '任务 b', '任务 new', '任务 other'])
    expect(JSON.parse(localStorage.getItem(recentSessionVisitsKey())!).map((visit: { id: string }) => visit.id)).toEqual(['a', 'c', 'b'])
  })

  it('keeps old manually pinned sessions visible beyond the normal recent limit', async () => {
    vi.spyOn(api, 'listSessions').mockResolvedValue([
      { ...session('new', 'D:/Alpha', 300), title: '最新会话' },
      { ...session('older', 'D:/Alpha', 200), title: '普通旧会话' },
      { ...session('pin', 'E:/Other', 1, true), title: '置顶旧会话', pinnedAt: 400 },
    ])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(createElement(QueryClientProvider, { client }, createElement(ConfirmProvider, null,
      createElement(RecentSessions, { currentSessionId: null, onSwitch: vi.fn(), limit: 1 }))))
    expect(await screen.findByRole('button', { name: /^置顶旧会话/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^最新会话/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^普通旧会话/ })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('已置顶')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /^最新会话/ }))
    expect(within(screen.getByRole('list', { name: '最近使用的会话' })).getAllByRole('listitem')[0]).toHaveTextContent('置顶旧会话')
  })

  it('stores only bounded, deduplicated visit metadata within each user scope', () => {
    for (let index = 0; index < 55; index++) recordSessionVisit(`s-${index}`, 11)
    recordSessionVisit('s-10', 11)
    recordSessionVisit('other-user', 22)
    const visits = JSON.parse(localStorage.getItem(recentSessionVisitsKey(11))!)
    expect(visits).toHaveLength(50)
    expect(visits[0]).toEqual({ id: 's-10', openedAt: expect.any(Number) })
    expect(visits.filter((visit: { id: string }) => visit.id === 's-10')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(recentSessionVisitsKey(22))!)[0].id).toBe('other-user')
    expect(localStorage.getItem(recentSessionVisitsKey())).toBeNull()
  })

  it('keeps switching usable with a visible warning when visit storage is rejected', async () => {
    vi.spyOn(api, 'listSessions').mockResolvedValue([{ ...session('one', 'D:/Alpha', 100), title: '任务 one' }])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onSwitch = vi.fn()
    render(createElement(QueryClientProvider, { client }, createElement(ConfirmProvider, null,
      createElement(RecentSessions, { currentSessionId: null, onSwitch }))))
    const row = await screen.findByRole('button', { name: /^任务 one/ })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    fireEvent.click(row)
    expect(onSwitch).toHaveBeenCalledWith('one', false)
    expect(screen.getByRole('status')).toHaveTextContent('最近查看顺序暂未保存')
    fireEvent.click(row)
    expect(screen.queryByText(/最近查看顺序暂未保存/)).not.toBeInTheDocument()
  })

  it('offers the same copy action in recent sessions and disables it while a copy is pending', async () => {
    const source = { ...session('source', 'D:/work/Alpha', Date.now()), title: '当前开发', codexHome: 'C:/Users/test/.codex-pro' }
    vi.spyOn(api, 'listSessions').mockResolvedValue([source])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onDuplicate = vi.fn()
    const onSwitch = vi.fn()
    const view = (duplicatingSessionId: string | null) => createElement(QueryClientProvider, { client },
      createElement(ConfirmProvider, null, createElement(RecentSessions,
        { currentSessionId: 'source', onSwitch, onDuplicate, duplicatingSessionId })))
    const { rerender } = render(view(null))
    fireEvent.click(await screen.findByRole('button', { name: '更多操作：当前开发' }))
    fireEvent.click(screen.getByRole('button', { name: '复制会话配置' }))
    expect(onDuplicate).toHaveBeenCalledExactlyOnceWith('source', 'C:/Users/test/.codex-pro')
    expect(onSwitch).not.toHaveBeenCalled()
    rerender(view('source'))
    fireEvent.click(screen.getByRole('button', { name: '更多操作：当前开发' }))
    expect(screen.getByRole('button', { name: '复制会话配置' })).toBeDisabled()
  })

  it('restores visits on remount, promotes an old visited session past the limit and removes inaccessible sessions', async () => {
    const alpha = session('alpha', 'D:\\Work\\Alpha', 100)
    const beta = session('beta', 'D:\\Work\\Beta', 200)
    vi.spyOn(api, 'listSessions').mockResolvedValue([alpha, beta])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = (currentSessionId: string) => createElement(QueryClientProvider, { client },
      createElement(ConfirmProvider, null,
        createElement(RecentSessions, { currentSessionId, onSwitch: vi.fn() })))
    const { rerender } = render(view('alpha'))

    await screen.findByRole('list', { name: '最近使用的会话' })
    act(() => recordSessionVisit('alpha'))
    rerender(view('beta'))
    expect(within(screen.getByRole('list', { name: '最近使用的会话' })).getAllByRole('listitem')[0]).toHaveTextContent('Alpha')
    const stored = localStorage.getItem(recentSessionVisitsKey())
    cleanup()
    render(createElement(QueryClientProvider, { client }, createElement(ConfirmProvider, null,
      createElement(RecentSessions, { currentSessionId: null, onSwitch: vi.fn(), limit: 1 }))))
    expect(await screen.findByRole('button', { name: /^Alpha/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Beta/ })).not.toBeInTheDocument()
    expect(localStorage.getItem(recentSessionVisitsKey())).toBe(stored)
    await act(async () => { client.setQueryData(['claude-chat-sessions'], [beta]) })
    expect(screen.queryByRole('button', { name: /^Alpha/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Beta/ })).toBeInTheDocument()
  })
})

describe('recent session rename', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the new name before the server responds and restores it on failure', async () => {
    vi.mocked(getSessionsByDevSessions).mockResolvedValue({})
    const original = { ...session('one', 'D:\\Work\\Alpha', 100), title: '旧名称' }
    vi.spyOn(api, 'listSessions').mockResolvedValue([original])
    let rejectRequest!: (error: Error) => void
    const rename = vi.spyOn(api, 'renameSession').mockImplementation(() =>
      new Promise<void>((_, reject) => { rejectRequest = reject }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(createElement(QueryClientProvider, { client },
      createElement(ConfirmProvider, null,
        createElement(RecentSessions, { currentSessionId: 'one', onSwitch: vi.fn() }))))

    const row = await screen.findByRole('button', { name: /^旧名称/ })
    fireEvent.doubleClick(row)
    const input = screen.getByDisplayValue('旧名称')
    fireEvent.change(input, { target: { value: '新名称' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(rename).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: /^新名称/ })).toBeInTheDocument()

    rejectRequest(new Error('网络不可用'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('网络不可用'))
    expect(screen.getByRole('button', { name: /^旧名称/ })).toBeInTheDocument()
  })

  it('shows import origin in recent rows and copies their own IDs with recoverable feedback', async () => {
    vi.mocked(getSessionsByDevSessions).mockResolvedValue({})
    const imported = { ...session('imported-id', 'D:/work/Alpha', 200), title: '导入会话', importSource: 'codex' as const }
    vi.spyOn(api, 'listSessions').mockResolvedValue([imported])
    const writeText = vi.fn().mockRejectedValueOnce(new Error('clipboard unavailable')).mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onSwitch = vi.fn()
    render(createElement(QueryClientProvider, { client }, createElement(ConfirmProvider, null,
      createElement(RecentSessions, { currentSessionId: null, onSwitch }))))
    expect(await screen.findByRole('button', { name: /^导入会话/ })).toHaveTextContent('Codex 导入')
    expect(screen.queryByRole('button', { name: '复制会话 ID' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '更多操作：导入会话' }))
    fireEvent.click(screen.getByRole('button', { name: '复制会话 ID' }))
    const retry = await screen.findByRole('button', { name: '复制会话 ID 失败' })
    expect(retry).toHaveTextContent('复制会话 ID 失败')
    fireEvent.click(retry)
    expect(await screen.findByRole('button', { name: '会话 ID 已复制' })).toHaveTextContent('会话 ID 已复制')
    expect(writeText).toHaveBeenNthCalledWith(1, 'imported-id')
    expect(writeText).toHaveBeenNthCalledWith(2, 'imported-id')
    expect(onSwitch).not.toHaveBeenCalled()
  })
})
