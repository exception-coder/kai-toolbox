import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionCommitsPanel } from './SessionCommitsPanel'
import { listSessionCommits, listSessionGitRepos, getSessionPushPreview, prepareSessionPull, pullSessionCommits } from '../api'

vi.mock('../api', () => ({
  listSessionGitRepos: vi.fn(), listSessionCommits: vi.fn(), getSessionCommitDiff: vi.fn(),
  listSessionGitBranches: vi.fn(async () => [{ ref: 'refs/heads/main', name: 'main', head: 'a', current: true, remote: false }]),
  prepareSessionPull: vi.fn(), pullSessionCommits: vi.fn(),
  getSessionGitWorkspace: vi.fn(async () => ({ branch: 'main', head: 'a', upstream: 'origin/main', ahead: 0, behind: 1, changes: 0, remoteChecked: false, checkedAt: '', notice: '远端未核对' })),
  prepareSessionBranchSwitch: vi.fn(), switchSessionBranch: vi.fn(), fetchSessionGitStatus: vi.fn(), fetchSessionGitFileDiff: vi.fn(),
  getSessionPushPreview: vi.fn(async () => ({ branch: 'main', head: 'a', remote: 'origin', targetBranch: 'main',
    destinations: [], ahead: 0, behind: 0, token: '', pushBlockedReason: '无待推送提交' })), pushSessionCommits: vi.fn(),
}))
vi.mock('./SessionProjectDirectoriesDialog', () => ({ SessionProjectDirectoriesDialog: ({ onChanged, onClose }: {
  onChanged: (paths: string[]) => void; onClose: () => void
}) => <button onClick={() => { onChanged(['C:/team-standards']); onClose() }}>保存关联</button> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('separates directory management and binds repository history and pull to the selected project', async () => {
  vi.mocked(listSessionGitRepos).mockResolvedValue([{ name: '', label: 'Forge', isRoot: true }, { name: 'linked:team', label: 'Team Standards', isRoot: false }])
  vi.mocked(listSessionCommits).mockImplementation(async (_id, _limit, repo) => ({ commits: [{ hash: repo || 'forge',
    shortHash: 'abc', author: 'user', date: '', subject: repo === 'linked:team' ? '治理绑定修复' : '主项目提交', body: '' }] }))
  const changed = vi.fn()
  render(<SessionCommitsPanel sessionId="s" primaryCwd="D:/forge" onClose={vi.fn()} onDirectoriesChanged={changed} />)
  await screen.findByText('主项目提交')
  expect(screen.queryByRole('button', { name: '管理关联目录' })).not.toBeInTheDocument()
  expect(changed).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button', { name: 'Team Standards' }))
  await screen.findByText('治理绑定修复')
  expect(screen.queryByText('主项目提交')).not.toBeInTheDocument()
  expect(listSessionCommits).toHaveBeenLastCalledWith('s', 100, 'linked:team', 'refs/heads/main')
  await waitFor(() => expect(getSessionPushPreview).toHaveBeenLastCalledWith('s', 'linked:team'))
  vi.mocked(prepareSessionPull).mockResolvedValue({ branch: 'main', head: 'a', remote: 'origin', targetBranch: 'main',
    source: 'safe', upstreamHead: 'b', ahead: 0, behind: 1, pullBlockedReason: '', token: 'pull-snapshot' })
  vi.mocked(pullSessionCommits).mockResolvedValue({ message: '拉取成功' })
  fireEvent.click(screen.getByRole('button', { name: '拉取更新' }))
  fireEvent.click(await screen.findByRole('button', { name: '确认拉取' }))
  await screen.findByText('拉取成功')
  expect(prepareSessionPull).toHaveBeenCalledWith('s', 'linked:team')
  expect(pullSessionCommits).toHaveBeenCalledWith('s', 'pull-snapshot', 'linked:team')
})
