import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CommitsPanel } from './CommitsPanel'
import type { CommitInfo } from './types'

afterEach(cleanup)

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
