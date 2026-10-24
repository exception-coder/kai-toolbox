import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import * as api from '../api'
import { getSessionsByDevSessions } from '@/features/prd-clarify/public-api'
import { RecentSessions, groupRecentSessionsByWorkspace } from './RecentSessions'
import type { ClaudeChatSessionView } from '../types'

vi.mock('@/features/prd-clarify/public-api', () => ({ getSessionsByDevSessions: vi.fn().mockResolvedValue({}) }))

beforeEach(() => vi.mocked(getSessionsByDevSessions).mockResolvedValue({}))
afterEach(cleanup)

function session(id: string, cwd: string, lastSeenAt: number, favorite = false): ClaudeChatSessionView {
  return { id, cwd, lastSeenAt, favorite, engine: 'codex', status: 'IDLE' } as ClaudeChatSessionView
}

describe('groupRecentSessionsByWorkspace', () => {
  it('groups equivalent Windows paths and orders groups by latest activity', () => {
    const groups = groupRecentSessionsByWorkspace([
      session('a1', 'D:\\Work\\Alpha', 100),
      session('b1', 'D:\\Work\\Beta', 300),
      session('a2', 'd:/work/alpha/', 200, true),
    ])

    expect(groups.map(group => group.label)).toEqual(['Beta', 'Alpha'])
    expect(groups[1].sessions.map(item => item.id)).toEqual(['a2', 'a1'])
  })

  it('keeps missing workspace data in one explicit fallback group', () => {
    const groups = groupRecentSessionsByWorkspace([session('a', '', 10), session('b', '  ', 20)])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('未识别工作区')
  })
})

describe('recent workspace disclosure', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps row/group order and scroll while switching and polling; applies new activity only on request', async () => {
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
    const alpha = await screen.findByRole('region', { name: '工作目录 D:/Alpha' })
    const order = () => within(alpha).getAllByRole('button', { name: /^任务 / }).map(row => row.getAttribute('title')?.split('\n')[0])
    const scroll = alpha.parentElement!
    scroll.scrollTop = 80
    for (const id of ['b', 'c', 'a']) {
      fireEvent.click(within(alpha).getByRole('button', { name: new RegExp('^任务 ' + id) }))
      result.rerender(view(id))
      expect(order()).toEqual(['任务 a', '任务 b', '任务 c'])
    }
    serverRows = [
      { ...rows[2], lastSeenAt: 1000, status: 'RUNNING', live: true }, ...rows.slice(0, 2), rows[3],
    ]
    await act(async () => { client.setQueryData(['claude-chat-sessions'], serverRows) })
    await waitFor(() => expect(screen.getByRole('button', { name: '更新最近会话排序' })).toHaveTextContent('有新活动'))
    expect(order()).toEqual(['任务 a', '任务 b', '任务 c'])
    expect(screen.getAllByRole('region', { name: /^工作目录 / }).map(region => region.getAttribute('aria-label')))
      .toEqual(['工作目录 D:/Beta', '工作目录 D:/Alpha'])
    expect(scroll.scrollTop).toBe(80)
    expect(screen.getByRole('button', { name: '更新最近会话排序' })).toHaveTextContent('有新活动')
    expect(pin).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '更新最近会话排序' }))
    expect(order()).toEqual(['任务 c', '任务 a', '任务 b'])
    expect(screen.getAllByRole('region', { name: /^工作目录 / })[0]).toHaveAttribute('aria-label', '工作目录 D:/Alpha')
  })

  it('keeps old manually pinned sessions visible beyond the normal recent limit', async () => {
    vi.spyOn(api, 'listSessions').mockResolvedValue([
      { ...session('new', 'D:/Alpha', 300), title: '最新会话' },
      { ...session('older', 'D:/Alpha', 200), title: '普通旧会话' },
      { ...session('pin', 'D:/Alpha', 1, true), title: '置顶旧会话', pinnedAt: 400 },
    ])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(createElement(QueryClientProvider, { client }, createElement(ConfirmProvider, null,
      createElement(RecentSessions, { currentSessionId: null, onSwitch: vi.fn(), limit: 1 }))))
    expect(await screen.findByRole('button', { name: /^置顶旧会话/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^最新会话/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^普通旧会话/ })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('已置顶')).toHaveLength(1)
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

  it('collapses groups independently, keeps the choice on data refresh, and reveals a newly current session', async () => {
    const alpha = session('alpha', 'D:\\Work\\Alpha', 100)
    const beta = session('beta', 'D:\\Work\\Beta', 200)
    vi.spyOn(api, 'listSessions').mockResolvedValue([alpha, beta])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = (currentSessionId: string) => createElement(QueryClientProvider, { client },
      createElement(ConfirmProvider, null,
        createElement(RecentSessions, { currentSessionId, onSwitch: vi.fn() })))
    const { rerender } = render(view('alpha'))

    const betaButton = await screen.findByRole('button', { name: /折叠工作目录 D:\\Work\\Beta/ })
    const betaList = document.getElementById(betaButton.getAttribute('aria-controls')!) as HTMLUListElement
    fireEvent.click(betaButton)
    expect(betaList.hidden).toBe(true)
    expect(screen.getByRole('button', { name: /折叠工作目录 D:\\Work\\Alpha/ })).toHaveAttribute('aria-expanded', 'true')

    client.setQueryData(['claude-chat-sessions'], [session('alpha', 'd:/work/alpha/', 300), beta])
    expect(screen.getByRole('button', { name: /展开工作目录 D:\\Work\\Beta/ })).toHaveAttribute('aria-expanded', 'false')
    expect(betaList.hidden).toBe(true)

    rerender(view('beta'))
    await waitFor(() => expect(screen.getByRole('button', { name: /折叠工作目录 D:\\Work\\Beta/ }))
      .toHaveAttribute('aria-expanded', 'true'))
    expect(betaList.hidden).toBe(false)
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
