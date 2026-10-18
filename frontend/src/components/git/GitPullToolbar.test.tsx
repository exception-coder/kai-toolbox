import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GitPushToolbar } from './GitPushToolbar'
import type { GitPullPreview } from './types'

afterEach(cleanup)
const pushActions = { preview: async () => ({ branch: 'main', head: 'a', remote: 'origin', targetBranch: 'main',
  destinations: [], ahead: 0, behind: 0, token: '', pushBlockedReason: '没有待推送提交' }), push: vi.fn() }
const preview: GitPullPreview = { branch: 'main', head: 'a', remote: 'origin', targetBranch: 'main', source: 'safe',
  upstreamHead: 'b', ahead: 0, behind: 1, pullBlockedReason: '', token: 'pull-token' }

it('reports up-to-date or divergence without enabling confirmation', async () => {
  const pulls = { prepare: vi.fn().mockResolvedValue({ ...preview, behind: 0, pullBlockedReason: '已是最新，无需拉取' }), pull: vi.fn() }
  render(<GitPushToolbar actions={pushActions} pullActions={pulls} onPending={vi.fn()} onPushed={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '拉取更新' }))
  await screen.findByText('已是最新，无需拉取')
  expect(screen.getByRole('button', { name: '确认拉取' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '取消拉取' }))
  expect(pulls.pull).not.toHaveBeenCalled()
})

it('keeps a failed execution visible and requires a fresh preview rather than retrying automatically', async () => {
  const pulls = { prepare: vi.fn().mockResolvedValue(preview), pull: vi.fn().mockRejectedValue(new Error('状态已变化')) }
  render(<GitPushToolbar actions={pushActions} pullActions={pulls} onPending={vi.fn()} onPushed={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '拉取更新' }))
  fireEvent.click(await screen.findByRole('button', { name: '确认拉取' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('先核对当前分支及文件')
  expect(pulls.pull).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: '确认拉取' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '拉取更新' })).toBeEnabled()
})

it('locks controls during checking and discards a late result for a replaced repository', async () => {
  let finish!: (value: GitPullPreview) => void
  const pulls = { prepare: () => new Promise<GitPullPreview>(resolve => { finish = resolve }), pull: vi.fn() }
  const view = render(<GitPushToolbar actions={pushActions} pullActions={pulls} repo="one" onPending={vi.fn()} onPushed={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '拉取更新' }))
  expect(screen.getByRole('button', { name: '检查更新中…' })).toBeDisabled()
  view.rerender(<GitPushToolbar actions={pushActions} pullActions={pulls} repo="two" onPending={vi.fn()} onPushed={vi.fn()} />)
  await act(async () => finish(preview))
  expect(screen.queryByText('origin/main → main')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '拉取更新' })).toBeEnabled()
})
