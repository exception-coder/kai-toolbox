import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CommitsPanel } from './CommitsPanel'
import type { CommitInfo, GitBranchRef } from './types'

afterEach(cleanup)

it('keeps overview to three commits and uses a dedicated searchable branch view with explicit switch confirmation', async () => {
  const ref = 'refs/heads/release/form-continuation-with-a-very-long-name'
  const switchBranch = vi.fn(async () => ({ message: '切换成功' }))
  const status = vi.fn(async () => ({ branch: 'main', head: 'a', upstream: 'origin/main', ahead: 0, behind: 0,
    changes: 0, remoteChecked: false, checkedAt: '', notice: '远端未核对' }))
  render(<CommitsPanel title="repo" onClose={vi.fn()} fetchDiff={vi.fn()}
    fetchBranches={async () => [branch('main', true), branch(ref.slice(11))]}
    fetchCommits={async () => [commit('one'), commit('two'), commit('three'), commit('four')]}
    workspaceActions={{ status, prepareSwitch: async () => ({ branch: 'main', head: 'a', ref, targetHead: 'b', localBranch: ref.slice(11), tracking: '', token: 'fixed' }), switchBranch }} />)
  await screen.findByText('three 提交')
  expect(screen.queryByText('four 提交')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看全部' }))
  expect(screen.getByText('four 提交')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '选择分支' }))
  fireEvent.change(screen.getByRole('textbox', { name: '搜索分支' }), { target: { value: 'continuation' } })
  expect(screen.getByText(ref.slice(11))).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '切换到此分支' }))
  await screen.findByRole('button', { name: '确认切换' })
  expect(switchBranch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认切换' }))
  await waitFor(() => expect(switchBranch).toHaveBeenCalledWith(ref, 'fixed', undefined))
})

it('loads older history bound to the first page head', async () => {
  const fetchCommits = vi.fn(async (_repo?: string, _branch?: string, offset?: number) => offset ? [commit('older')] : [commit('new'), commit('previous')])
  render(<CommitsPanel title="repo" onClose={vi.fn()} fetchDiff={vi.fn()} pageSize={2} fetchCommits={fetchCommits} />)
  await screen.findByText('new 提交')
  fireEvent.click(screen.getByRole('button', { name: '查看全部' }))
  fireEvent.click(screen.getByRole('button', { name: '加载更早提交' }))
  await screen.findByText('older 提交')
  expect(fetchCommits).toHaveBeenLastCalledWith(undefined, undefined, 2, 'new')
  expect(screen.queryByRole('button', { name: '加载更早提交' })).not.toBeInTheDocument()
})

it('keeps browsing available but hides new write and paging actions when the workspace API is unavailable', async () => {
  render(<CommitsPanel title="repo" onClose={vi.fn()} fetchDiff={vi.fn()} pageSize={2}
    fetchCommits={async () => [commit('one'), commit('two')]} fetchBranches={async () => [branch('main', true), branch('feature')]}
    workspaceActions={{ status: async () => { throw new Error('服务尚未更新') }, prepareSwitch: vi.fn(), switchBranch: vi.fn() }} />)
  await screen.findByText(/服务尚未更新/)
  fireEvent.click(screen.getByRole('button', { name: '选择分支' }))
  expect(screen.queryByRole('button', { name: '切换到此分支' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看 feature 的提交' }))
  await screen.findByText('one 提交')
  expect(screen.queryByRole('button', { name: '加载更早提交' })).not.toBeInTheDocument()
})

it('checks then confirms a pull for the selected repo, protects the dialog and refreshes history', async () => {
  let finish!: (result: { message: string }) => void
  const onClose = vi.fn()
  const commits = vi.fn(async () => [])
  const pulls = {
    prepare: vi.fn(async () => ({ branch: 'main', head: 'local000', remote: 'origin', targetBranch: 'main',
      source: 'example/repo', upstreamHead: 'remote00', ahead: 0, behind: 2, pullBlockedReason: '', token: 'snapshot' })),
    pull: vi.fn(() => new Promise<{ message: string }>(resolve => { finish = resolve })),
  }
  render(<CommitsPanel title="repository" fetchCommits={commits} fetchDiff={vi.fn()} onClose={onClose}
    fetchRepos={async () => [{ name: 'selected', label: 'selected', isRoot: true }, { name: 'other', label: 'other', isRoot: false }]}
    pullActions={pulls} pushActions={{ preview: async () => ({ branch: 'main', head: 'local000', remote: 'origin',
      targetBranch: 'main', destinations: [], ahead: 0, behind: 2, token: 'old', pushBlockedReason: '落后上游' }), push: vi.fn() }} />)
  fireEvent.click(await screen.findByRole('button', { name: '拉取更新' }))
  await screen.findByText(/远程跟踪 origin\/main/)
  expect(pulls.prepare).toHaveBeenCalledWith('selected')
  expect(pulls.pull).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认拉取' }))
  expect(pulls.pull).toHaveBeenCalledWith('snapshot', 'selected')
  expect(screen.getByRole('button', { name: 'other' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => finish({ message: '拉取成功' }))
  expect(screen.getByText('拉取成功')).toBeInTheDocument()
  expect(commits).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: '关闭' })).toBeEnabled()
})

it('protects dismissal while push is pending and restores focus on close', async () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  let finish!: (result: { message: string }) => void
  const onClose = vi.fn()
  const view = render(<CommitsPanel title="repository" fetchCommits={async () => []} fetchDiff={vi.fn()}
    onClose={onClose} pushActions={{ preview: async () => ({ branch: 'main', head: 'a', remote: 'origin',
      targetBranch: 'main', destinations: ['example/repo'], ahead: 1, behind: 0, token: 'token', pushBlockedReason: '' }),
      push: () => new Promise(resolve => { finish = resolve }) }} />)
  await screen.findByText(/远程跟踪 origin\/main/)
  fireEvent.click(screen.getByRole('button', { name: /^推送$/ }))
  fireEvent.click(screen.getByRole('button', { name: '确认推送' }))
  expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => finish({ message: 'success' }))
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onClose).toHaveBeenCalledOnce()
  view.unmount()
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  trigger.remove()
})

it('keeps selected-repository commits when an earlier list request arrives late', async () => {
  let first!: (result: CommitInfo[]) => void
  const commit = (hash: string): CommitInfo => ({ hash, shortHash: hash, subject: hash, body: '', author: 'user', date: '' })
  render(<CommitsPanel title="repository" onClose={vi.fn()} fetchDiff={vi.fn()}
    fetchRepos={async () => [{ name: 'one', label: 'one', isRoot: true }, { name: 'two', label: 'two', isRoot: false }]}
    fetchCommits={repo => repo === 'one' ? new Promise(resolve => { first = resolve }) : Promise.resolve([commit('new')])} />)
  fireEvent.click(await screen.findByRole('button', { name: 'two' }))
  await screen.findByText('new', { selector: 'span' })
  await act(async () => first([commit('old')]))
  expect(screen.queryByText('old')).not.toBeInTheDocument()
})

const branch = (name: string, current = false): GitBranchRef => ({ ref: `refs/heads/${name}`, name, head: name, current, remote: false })
const commit = (name: string): CommitInfo => ({ hash: name, shortHash: name, subject: `${name} 提交`, body: '', author: 'user', date: '' })

it('browses branch labels without sync actions and ignores late commits and diff from a previous branch', async () => {
  let finishOld!: (commits: CommitInfo[]) => void
  let finishDiff!: (diff: import('./types').CommitDiff) => void
  const fetchCommits = vi.fn((_repo?: string, ref?: string) => ref === 'refs/heads/slow'
    ? new Promise<CommitInfo[]>(resolve => { finishOld = resolve }) : Promise.resolve([commit(ref === 'refs/heads/main' ? 'main' : 'feature')]))
  render(<CommitsPanel title="repo" onClose={vi.fn()} fetchBranches={async () => [branch('main', true), branch('slow'), branch('feature')]}
    fetchCommits={fetchCommits} fetchDiff={() => new Promise(resolve => { finishDiff = resolve })}
    pushActions={{ preview: async () => ({ branch: 'main', head: 'a', remote: 'origin', targetBranch: 'main', destinations: [], ahead: 0, behind: 0, token: '', pushBlockedReason: '' }), push: vi.fn() }} />)
  await screen.findByText('main 提交')
  expect(screen.getByText('当前分支')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '选择分支' }))
  fireEvent.click(screen.getByRole('button', { name: '查看 slow 的提交' }))
  fireEvent.click(screen.getByRole('button', { name: '选择分支' }))
  fireEvent.click(screen.getByRole('button', { name: '查看 feature 的提交' }))
  await screen.findByText('feature 提交')
  await act(async () => finishOld([commit('slow')]))
  expect(screen.queryByText('slow 提交')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^推送$/ })).not.toBeInTheDocument()
  expect(screen.getByText(/只读查看，不切换工作分支/)).toBeInTheDocument()
  fireEvent.click(screen.getByText('feature 提交'))
  await screen.findByText('加载 diff…')
  fireEvent.click(screen.getByRole('button', { name: '返回列表' }))
  fireEvent.click(screen.getByRole('button', { name: '选择分支' }))
  fireEvent.click(screen.getByRole('button', { name: '查看 main 的提交' }))
  await screen.findByText('main 提交')
  await act(async () => finishDiff({ ...commit('feature'), diff: 'old patch', truncated: false }))
  expect(screen.queryByText('old patch')).not.toBeInTheDocument()
  expect(fetchCommits).toHaveBeenLastCalledWith(undefined, 'refs/heads/main')
  expect(screen.getByText(/本地记录一致/)).toBeInTheDocument()
})

it('isolates late branch catalogs between repositories and clears a removed branch on refresh', async () => {
  let finishFirst!: (branches: GitBranchRef[]) => void
  const fetchBranches = vi.fn((repo?: string) => repo === 'one' ? new Promise<GitBranchRef[]>(resolve => { finishFirst = resolve })
    : Promise.resolve([branch('main', true), branch('feature')]))
  render(<CommitsPanel title="repo" onClose={vi.fn()} fetchDiff={vi.fn()} fetchBranches={fetchBranches}
    fetchRepos={async () => [{ name: 'one', label: 'one', isRoot: true }, { name: 'two', label: 'two', isRoot: false }]}
    fetchCommits={async (_repo, ref) => [commit(ref === 'refs/heads/feature' ? 'feature' : 'main')]} />)
  fireEvent.click(await screen.findByRole('button', { name: 'two' }))
  await screen.findByText('main 提交')
  await act(async () => finishFirst([branch('wrong-repo', true)]))
  expect(screen.queryByRole('button', { name: /wrong-repo/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '选择分支' }))
  fireEvent.click(screen.getByRole('button', { name: '查看 feature 的提交' }))
  await screen.findByText('feature 提交')
  fetchBranches.mockResolvedValue([branch('main', true)])
  fireEvent.click(screen.getByRole('button', { name: '刷新状态' }))
  await screen.findByText('main 提交')
  expect(screen.getByRole('status')).toHaveTextContent('原查看分支已不存在')
})

it('keeps current-branch history usable when the branch endpoint is unavailable and allows recovery', async () => {
  const fetchBranches = vi.fn<() => Promise<GitBranchRef[]>>().mockRejectedValueOnce(new Error('接口未就绪'))
    .mockResolvedValue([branch('main', true)])
  render(<CommitsPanel title="repo" onClose={vi.fn()} fetchDiff={vi.fn()} fetchBranches={fetchBranches}
    fetchCommits={async () => [commit('main')]} />)
  await screen.findByText('main 提交')
  expect(screen.getByRole('alert')).toHaveTextContent('当前显示工作分支')
  fireEvent.click(screen.getByRole('button', { name: '刷新状态' }))
  await screen.findByText('当前分支')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
