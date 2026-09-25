import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import * as api from '../api'
import { getSessionsByDevSessions } from '@/features/prd-clarify/public-api'
import { RecentSessions, groupRecentSessionsByWorkspace } from './RecentSessions'
import type { ClaudeChatSessionView } from '../types'

vi.mock('@/features/prd-clarify/public-api', () => ({ getSessionsByDevSessions: vi.fn().mockResolvedValue({}) }))

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

    const row = await screen.findByRole('button', { name: /旧名称/ })
    fireEvent.doubleClick(row)
    const input = screen.getByDisplayValue('旧名称')
    fireEvent.change(input, { target: { value: '新名称' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(rename).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: /新名称/ })).toBeInTheDocument()

    rejectRequest(new Error('网络不可用'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('网络不可用'))
    expect(screen.getByRole('button', { name: /旧名称/ })).toBeInTheDocument()
  })
})
