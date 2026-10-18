import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CommitsPanel } from './CommitsPanel'
import type { CommitInfo } from './types'

afterEach(cleanup)

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
  await screen.findByText('origin/main → main')
  expect(pulls.prepare).toHaveBeenCalledWith('selected')
  expect(pulls.pull).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认拉取' }))
  expect(pulls.pull).toHaveBeenCalledWith('snapshot', 'selected')
  expect(screen.getByRole('button', { name: 'other' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => finish({ message: '拉取成功' }))
  expect(screen.getByRole('status')).toHaveTextContent('拉取成功')
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
  await screen.findByText('main → origin/main')
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
