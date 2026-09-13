import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectGitWorkspace } from './ProjectGitWorkspace'
import { getGitWorkspace, pushGitWorkspace, type GitWorkspace } from './api'
import type { RegistryProject } from '../registry/types'

vi.mock('./api', () => ({ getGitWorkspace: vi.fn(), pushGitWorkspace: vi.fn() }))
const project = { id: 'forge', metadata: { name: 'Forge', localPath: 'D:/work/forge' } } as RegistryProject
const snapshot: GitWorkspace = {
  branch: 'main', head: '123456789abcdef', upstream: 'origin/main', remote: 'origin', targetBranch: 'main',
  destinations: ['github.com/example/forge', 'gitee.com/example/forge'],
  ahead: 1, behind: 0, pushBlockedReason: '', token: 'snapshot-token',
  files: [{ path: '新 名称.txt', origPath: 'old.txt', x: 'R', y: 'M' }],
  commits: [{ hash: '123456789abcdef', subject: '新增项目功能', author: 'Kai', date: '2026-09-12T08:00:00Z' }],
}
function show(selected = project) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const viewOf = (value: RegistryProject) => <QueryClientProvider client={client}>
    <ProjectGitWorkspace key={value.id} project={value} />
  </QueryClientProvider>
  const view = render(viewOf(selected))
  return { ...view, select: (value: RegistryProject) => view.rerender(viewOf(value)) }
}
describe('project Git workspace', () => {
  afterEach(cleanup)
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(getGitWorkspace).mockResolvedValue(snapshot) })

  it('separates changed files from outgoing commits and pushes the displayed snapshot', async () => {
    vi.mocked(pushGitWorkspace).mockResolvedValue({ message: '推送成功，已发送所选提交' })
    show()
    expect(await screen.findByText('新 名称.txt')).toBeInTheDocument()
    expect(screen.getByText('原路径：old.txt')).toBeInTheDocument()
    expect(screen.getByText('Push 将发送到以下 2 个已配置地址：')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '待 Push · 1' }))
    expect(screen.getByText('新增项目功能')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Push 当前分支' }))
    await waitFor(() => expect(pushGitWorkspace).toHaveBeenCalledWith('forge', 'snapshot-token'))
    expect(await screen.findByText(/推送成功，已发送所选提交/)).toBeInTheDocument()
    await waitFor(() => expect(getGitWorkspace).toHaveBeenCalledTimes(2))
  })

  it('shows unavailable upstream and disables push', async () => {
    vi.mocked(getGitWorkspace).mockResolvedValue({ ...snapshot, ahead: null, behind: null, commits: [], pushBlockedReason: '请先设置 upstream' })
    show()
    expect(await screen.findByText('请先设置 upstream')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Push 当前分支' })).toBeDisabled()
  })

  it('keeps a failed push visible with refresh recovery', async () => {
    vi.mocked(pushGitWorkspace).mockRejectedValue(new Error('远端拒绝，请同步后重试'))
    show()
    await screen.findByText('新 名称.txt')
    fireEvent.click(screen.getByRole('button', { name: 'Push 当前分支' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('远端拒绝')
    expect(screen.queryByText(/推送成功，已发送/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled())
  })

  it('does not present loading or errors as a clean repository', async () => {
    vi.mocked(getGitWorkspace).mockRejectedValue(new Error('项目目录不可访问'))
    show()
    expect(screen.getByRole('status')).toHaveTextContent('正在读取')
    expect(await screen.findByRole('alert')).toHaveTextContent('项目目录不可访问')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Push 当前分支' })).toBeDisabled()
  })

  it('resets repository context when selecting another project', async () => {
    const view = show()
    await screen.findByText('新 名称.txt')
    view.select({ ...project, id: 'other', metadata: { ...project.metadata, name: 'Other' } })
    await waitFor(() => expect(getGitWorkspace).toHaveBeenCalledWith('other'))
    expect(screen.getByRole('region', { name: 'Other Git 工作区' })).toBeInTheDocument()
  })
})
