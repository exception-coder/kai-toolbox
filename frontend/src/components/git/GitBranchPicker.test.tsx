import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GitBranchPicker } from './GitBranchPicker'
import { groupBranches } from './branchGroups'
import type { GitBranchRef } from './types'
afterEach(cleanup)
const local: GitBranchRef = { ref: 'refs/heads/main', name: 'main', head: 'a', current: true, remote: false }
const origin: GitBranchRef = { ref: 'refs/remotes/origin/main', name: 'origin/main', head: 'b', current: false, remote: true }
const gitee: GitBranchRef = { ...origin, ref: 'refs/remotes/gitee/main', name: 'gitee/main', head: 'a' }
const props = { branches: [origin, gitee, local], busy: false, loading: false, selected: local.ref, canSwitch: true, workspace: null, onRefresh: vi.fn(), onBrowse: vi.fn(), onSwitch: vi.fn(), onCopy: vi.fn() }
it('groups names without collapsing sources or stripping local names', () => {
  const groups = groupBranches([...props.branches, { ...local, name: 'origin/main', ref: 'refs/heads/origin/main', current: false }, { ...local, name: 'Main', ref: 'refs/heads/Main', current: false }])
  expect(groups[0].name).toBe('main'); expect(groups[0].sources).toHaveLength(3); expect(groups).toHaveLength(3)
  expect(groupBranches([{ ...origin, remoteName: '', logicalName: '' }, local])).toHaveLength(2)
})
it('shows precise actions in source details and filters individual remotes', () => {
  render(<GitBranchPicker {...props} />)
  expect(screen.getAllByRole('button', { name: /查看分支 .* 的来源/ })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: /查看 .* 的提交/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看分支 main 的来源' }))
  expect(screen.getByText('提交不同，差异未核验')).toBeInTheDocument()
  expect(screen.getByText('提交相同（本地记录）')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '创建跟踪分支' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看 origin/main 的提交' }))
  expect(props.onBrowse).toHaveBeenCalledWith(origin.ref)
  fireEvent.click(screen.getByRole('button', { name: '远程' }))
  fireEvent.change(screen.getByRole('combobox', { name: '远程来源' }), { target: { value: 'gitee' } })
  fireEvent.click(screen.getByRole('button', { name: '查看分支 main 的来源' }))
  expect(screen.queryByRole('button', { name: '查看 origin/main 的提交' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看 gitee/main 的提交' })).toBeInTheDocument()
})
it('rejects stale comparison receipts', async () => {
  const compare = vi.fn(async () => ({ baseRef: local.ref, ref: origin.ref, baseHead: 'changed', head: 'b', ahead: 0, behind: 0, checkedAt: 'now' }))
  render(<GitBranchPicker {...props} branches={[local, origin]} compare={compare} />)
  fireEvent.click(screen.getByRole('button', { name: '查看分支 main 的来源' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '核对差异' })))
  expect(screen.getByRole('alert')).toHaveTextContent('分支提交已变化')
  expect(screen.queryByText('本地记录一致')).not.toBeInTheDocument()
})
it('creates tracking only for a remote-only branch and preserves the exact source', () => {
  render(<GitBranchPicker {...props} branches={[origin]} />)
  fireEvent.click(screen.getByRole('button', { name: '查看分支 main 的来源' }))
  fireEvent.click(screen.getByRole('button', { name: '创建跟踪分支' }))
  expect(props.onSwitch).toHaveBeenCalledWith(origin.ref)
})
it('discards comparison responses after a source commit changes', async () => {
  let finish!: (value: import('./types').GitBranchComparison) => void
  const compare = () => new Promise<import('./types').GitBranchComparison>(resolve => { finish = resolve })
  const view = render(<GitBranchPicker {...props} branches={[local, origin]} compare={compare} />)
  fireEvent.click(screen.getByRole('button', { name: '查看分支 main 的来源' }))
  fireEvent.click(screen.getByRole('button', { name: '核对差异' }))
  view.rerender(<GitBranchPicker {...props} branches={[local, { ...origin, head: 'new' }]} compare={compare} />)
  await act(async () => finish({ baseRef: local.ref, ref: origin.ref, baseHead: 'a', head: 'b', ahead: 0, behind: 0, checkedAt: 'old' }))
  expect(screen.queryByText('本地记录一致')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '核对差异' })).toBeEnabled()
})
