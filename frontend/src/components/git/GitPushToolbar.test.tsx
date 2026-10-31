import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitPushToolbar } from './GitPushToolbar'
import type { GitPushPreview } from './types'

const preview: GitPushPreview = { branch: 'main', head: 'a'.repeat(40), remote: 'origin', targetBranch: 'main',
  destinations: ['github.com/team/repo'], ahead: 2, behind: 0, pushBlockedReason: '', token: 'snapshot' }

afterEach(cleanup)

describe('GitPushToolbar', () => {
  it('never calls cached zero counts synced, and only shows synced after a fresh remote check', async () => {
    const workspace = { branch: 'main', head: 'a', upstream: 'origin/main', ahead: 0, behind: 0, changes: 0,
      remoteChecked: false, checkedAt: '', notice: '数量来自本地记录' }
    const actions = { preview: vi.fn(async () => ({ ...preview, ahead: 0, token: '', pushBlockedReason: '没有待推送提交' })), push: vi.fn() }
    const view = render(<GitPushToolbar actions={actions} workspace={workspace} onPending={vi.fn()} onPushed={vi.fn()} />)
    await screen.findByText('本地记录一致 · 远端未核对')
    expect(screen.queryByRole('button', { name: '推送' })).not.toBeInTheDocument()
    view.rerender(<GitPushToolbar actions={actions} workspace={{ ...workspace, remoteChecked: true, checkedAt: new Date().toISOString() }} onPending={vi.fn()} onPushed={vi.fn()} />)
    await screen.findByText('已同步')
    view.rerender(<GitPushToolbar actions={actions} workspace={{ ...workspace, ahead: 2, behind: 1 }} onPending={vi.fn()} onPushed={vi.fn()} />)
    await screen.findByText('分支已分叉')
    expect(screen.queryByRole('button', { name: '推送' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拉取更新' })).not.toBeInTheDocument()
  })
  it('requires confirmation and binds push to the displayed repository snapshot', async () => {
    let finish!: (result: { message: string }) => void
    const actions = { preview: vi.fn().mockResolvedValue(preview),
      push: vi.fn(() => new Promise<{ message: string }>(resolve => { finish = resolve })) }
    const onPending = vi.fn()
    const onPushed = vi.fn()
    render(<GitPushToolbar actions={actions} repo="child" onPending={onPending} onPushed={onPushed} />)
    await screen.findByText(/远程跟踪 origin\/main/)
    fireEvent.click(screen.getByRole('button', { name: /^推送$/ }))
    expect(actions.push).not.toHaveBeenCalled()
    expect(screen.getByText('github.com/team/repo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认推送' }))
    expect(actions.push).toHaveBeenCalledWith('snapshot', 'child')
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(onPending).toHaveBeenCalledWith(true)
    await act(async () => finish({ message: '推送成功' }))
    expect(await screen.findByText('推送成功')).toBeInTheDocument()
    expect(onPushed).toHaveBeenCalledOnce()
    expect(onPending).toHaveBeenLastCalledWith(false)
  })

  it('keeps confirmed push success when the following preview refresh fails', async () => {
    const actions = { preview: vi.fn().mockResolvedValueOnce(preview).mockRejectedValue(new Error('网络断开')),
      push: vi.fn().mockResolvedValue({ message: '推送成功' }) }
    render(<GitPushToolbar actions={actions} onPending={vi.fn()} onPushed={vi.fn()} />)
    await screen.findByText(/远程跟踪 origin\/main/)
    fireEvent.click(screen.getByRole('button', { name: /^推送$/ }))
    fireEvent.click(screen.getByRole('button', { name: '确认推送' }))
    expect(await screen.findByText('推送成功')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('状态刷新失败')
  })

  it('shows a recoverable failure and reloads the snapshot without automatically retrying push', async () => {
    const actions = { preview: vi.fn().mockResolvedValue(preview), push: vi.fn().mockRejectedValue(new Error('认证失败')) }
    render(<GitPushToolbar actions={actions} onPending={vi.fn()} onPushed={vi.fn()} />)
    await screen.findByText(/远程跟踪 origin\/main/)
    fireEvent.click(screen.getByRole('button', { name: /^推送$/ }))
    fireEvent.click(screen.getByRole('button', { name: '确认推送' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('请先刷新核对远端状态')
    await waitFor(() => expect(actions.preview).toHaveBeenCalledTimes(2))
    expect(actions.push).toHaveBeenCalledOnce()
  })

  it('blocks push without an eligible upstream and discards a late preview from another repository', async () => {
    let late!: (result: GitPushPreview) => void
    const actions = { preview: vi.fn((repo?: string) => repo === 'old'
      ? new Promise<GitPushPreview>(resolve => { late = resolve })
      : Promise.resolve({ ...preview, branch: 'other', pushBlockedReason: '未配置远端上游' })), push: vi.fn() }
    const callbacks = { onPending: vi.fn(), onPushed: vi.fn() }
    const view = render(<GitPushToolbar actions={actions} repo="old" {...callbacks} />)
    view.rerender(<GitPushToolbar actions={actions} repo="new" {...callbacks} />)
    await screen.findByText(/远程跟踪 origin\/main/)
    await act(async () => late(preview))
    expect(screen.queryByText('main → origin/main')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^推送$/ })).toBeDisabled()
  })
})
