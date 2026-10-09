import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { getSessionsByDevSessions, type PrdSessionView } from '@/features/prd-clarify/public-api'
import * as api from '../api'
import type { ClaudeChatSessionView } from '../types'
import { SessionList } from './SessionList'
import { resetVisibleSessionStatuses } from '../lib/sessionStatusFilter'

vi.mock('@/features/prd-clarify/public-api', () => ({ getSessionsByDevSessions: vi.fn().mockResolvedValue({}) }))

function session(id: string, cwd: string, group: string | null = null): ClaudeChatSessionView {
  return {
    id, cwd, group, title: '任务 ' + id, sdkSessionId: null, engine: 'codex',
    status: 'IDLE', live: false, startedAt: 1, lastSeenAt: Date.now(),
  }
}

function renderList(sessions: ClaudeChatSessionView[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  client.setQueryData(['claude-chat-sessions'], sessions)
  const onSwitch = vi.fn()
  render(<QueryClientProvider client={client}>
    <ConfirmProvider><SessionList currentSessionId={null} onSwitch={onSwitch} /></ConfirmProvider>
  </QueryClientProvider>)
  return { client, onSwitch }
}

beforeEach(() => {
  localStorage.clear()
  resetVisibleSessionStatuses()
  vi.mocked(getSessionsByDevSessions).mockResolvedValue({})
  vi.spyOn(api, 'listSessions').mockImplementation(() => new Promise(() => {}))
  vi.spyOn(api, 'setSessionGroupApi').mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('session project navigation', () => {
  it('automatically groups equivalent directories and enters only their sessions without writing groups', () => {
    const running = { ...session('alpha-2', 'd:/work/alpha/'), status: 'RUNNING' as const, live: true }
    const { onSwitch } = renderList([
      session('alpha-1', 'D:\\Work\\Alpha'),
      running,
      session('beta', 'D:\\Work\\Beta'),
      session('review', 'D:\\Work\\Alpha', '评审会话'),
      session('unknown', ''),
    ])
    const projects = screen.getByRole('navigation', { name: '会话项目目录' })
    const alpha = within(projects).getByRole('button', { name: '打开项目 Alpha，工作目录 D:\\Work\\Alpha' })
    expect(alpha).toHaveTextContent('2 个会话')
    expect(alpha).toHaveTextContent('1 个进行中')
    expect(within(projects).getByRole('button', { name: '打开项目 评审会话' })).toBeInTheDocument()
    expect(within(projects).getByRole('button', { name: '打开项目 未分组' })).toHaveTextContent('1 个会话')

    fireEvent.click(alpha)
    expect(screen.getByText('主工作目录 · D:\\Work\\Alpha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /任务 beta/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /任务 review/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /任务 alpha-2/ }))
    expect(onSwitch).toHaveBeenCalledWith('alpha-2', true)
    expect(api.setSessionGroupApi).not.toHaveBeenCalled()
  })

  it('keeps matching directory names separate and labels global search with the automatic group', () => {
    renderList([
      session('first', 'D:/work/Alpha'),
      session('other', 'E:/work/Alpha'),
      session('manual', 'D:/work/Alpha', 'Alpha'),
    ])
    const projects = screen.getByRole('navigation', { name: '会话项目目录' })
    expect(within(projects).getAllByRole('button', { name: /^打开项目 Alpha/ })).toHaveLength(3)
    fireEvent.click(within(projects).getByRole('button', { name: '打开项目 Alpha，工作目录 E:/work/Alpha' }))
    expect(screen.getByRole('button', { name: /任务 other/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /任务 first/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回项目目录' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索会话别名' }), { target: { value: '任务 first' } })
    expect(screen.getByRole('button', { name: /任务 first/ })).toHaveTextContent('Alpha')
    expect(screen.queryByText('未分组')).not.toBeInTheDocument()
  })

  it('reuses the existing project rename operation for manual groups', async () => {
    const rename = vi.spyOn(api, 'renameSessionProject').mockResolvedValue(undefined)
    renderList([session('review', 'D:/work/Alpha', '评审会话'), session('automatic', 'D:/work/Alpha')])
    expect(screen.queryByRole('button', { name: '重命名项目 Alpha' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重命名项目 评审会话' }))
    fireEvent.change(screen.getByPlaceholderText('输入新的项目名称'), { target: { value: '设计评审' } })
    fireEvent.click(screen.getByRole('button', { name: '确认重命名' }))
    await waitFor(() => expect(rename).toHaveBeenCalledWith('评审会话', '设计评审'))
    expect(api.setSessionGroupApi).not.toHaveBeenCalled()
  })

  it('restores automatic grouping when a custom group is cleared and reflects refreshed primary directories', async () => {
    const original = session('review', 'D:/work/Alpha', '评审会话')
    const { client } = renderList([original])
    fireEvent.click(screen.getByRole('button', { name: '打开项目 评审会话' }))
    fireEvent.click(screen.getByRole('button', { name: '设置系统和需求分组' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复自动分组' }))
    await waitFor(() => expect(api.setSessionGroupApi).toHaveBeenCalledWith('review', null, undefined))
    await act(async () => { client.setQueryData(['claude-chat-sessions'], [{ ...original, group: null }]) })
    const alpha = await screen.findByRole('button', { name: '打开项目 Alpha，工作目录 D:/work/Alpha' })
    fireEvent.click(alpha)
    await act(async () => { client.setQueryData(['claude-chat-sessions'], [{ ...original, group: null, cwd: 'E:/work/Beta' }]) })
    expect(await screen.findByRole('button', { name: '打开项目 Beta，工作目录 E:/work/Beta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^打开项目 Alpha/ })).not.toBeInTheDocument()
  })

  it('keeps expired sessions out of the default counts and retains specification filtering', async () => {
    vi.mocked(getSessionsByDevSessions).mockResolvedValueOnce({ linked: { id: 'prd', title: '规划', status: 'DONE' } as PrdSessionView })
    renderList([
      session('linked', 'D:/work/Alpha'),
      session('unlinked', 'D:/work/Alpha'),
      { ...session('expired', 'D:/work/Alpha'), planExpired: true },
    ])
    const alpha = screen.getByRole('button', { name: '打开项目 Alpha，工作目录 D:/work/Alpha' })
    expect(alpha).toHaveTextContent('2 个会话')
    fireEvent.click(alpha)
    fireEvent.change(screen.getByRole('combobox', { name: '按是否关联规格筛选' }), { target: { value: 'linked' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /任务 linked/ })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /任务 unlinked/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /任务 expired/ })).not.toBeInTheDocument()
  })
})
