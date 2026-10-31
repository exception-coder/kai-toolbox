import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionCommitsPanel } from './SessionCommitsPanel'
import { listSessionCommits, listSessionGitRepos, getSessionPushPreview, prepareSessionPull, pullSessionCommits } from '../api'

vi.mock('../api', () => ({
  listSessionGitRepos: vi.fn(), listSessionCommits: vi.fn(), getSessionCommitDiff: vi.fn(),
  listSessionGitBranches: vi.fn(async () => [{ ref: 'refs/heads/main', name: 'main', head: 'a', current: true, remote: false }]),
  prepareSessionPull: vi.fn(), pullSessionCommits: vi.fn(),
  getSessionPushPreview: vi.fn(async () => ({ branch: 'main', head: 'a', remote: 'origin', targetBranch: 'main',
    destinations: [], ahead: 0, behind: 0, token: '', pushBlockedReason: '无待推送提交' })), pushSessionCommits: vi.fn(),
}))
vi.mock('./SessionProjectDirectoriesDialog', () => ({ SessionProjectDirectoriesDialog: ({ onChanged, onClose }: {
  onChanged: (paths: string[]) => void; onClose: () => void
}) => <button onClick={() => { onChanged(['C:/team-standards']); onClose() }}>保存关联</button> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('returns from association management with refreshed repositories and queries selected project', async () => {
  vi.mocked(listSessionGitRepos).mockResolvedValueOnce([{ name: '', label: 'Forge', isRoot: true }])
    .mockResolvedValue([{ name: '', label: 'Forge', isRoot: true }, { name: 'linked:team', label: 'Team Standards', isRoot: false }])
  vi.mocked(listSessionCommits).mockImplementation(async (_id, _limit, repo) => ({ commits: [{ hash: repo || 'forge',
    shortHash: 'abc', author: 'user', date: '', subject: repo === 'linked:team' ? '治理绑定修复' : '主项目提交', body: '' }] }))
  const changed = vi.fn()
  render(<SessionCommitsPanel sessionId="s" primaryCwd="D:/forge" onClose={vi.fn()} onDirectoriesChanged={changed} />)
  await screen.findByText('主项目提交')
  fireEvent.click(screen.getByRole('button', { name: '管理关联目录' }))
  fireEvent.click(screen.getByRole('button', { name: '保存关联' }))
  expect(changed).toHaveBeenCalledWith(['C:/team-standards'])
  fireEvent.click(await screen.findByRole('button', { name: 'Team Standards' }))
  await screen.findByText('治理绑定修复')
  expect(screen.queryByText('主项目提交')).not.toBeInTheDocument()
  expect(listSessionCommits).toHaveBeenLastCalledWith('s', 50, 'linked:team', 'refs/heads/main')
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
