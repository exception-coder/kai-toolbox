import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectGitDialog } from './ProjectGitDialog'
import { ProjectRegistryPage } from '../registry/ProjectRegistryPage'
import { listRegistry } from '../registry/api'
import { getGitWorkspace, pushGitWorkspace, type GitWorkspace } from './api'
import type { RegistryProject } from '../registry/types'

vi.mock('./api', () => ({ getGitWorkspace: vi.fn(), pushGitWorkspace: vi.fn() }))
vi.mock('../registry/api', () => ({ listRegistry: vi.fn() }))
vi.mock('../registry/LocalProjectDiscovery', () => ({ LocalProjectDiscovery: () => null }))
vi.mock('../registry/ProjectRegistrationForm', () => ({ ProjectRegistrationForm: () => null }))
vi.mock('../registry/ProjectDirectorySettings', () => ({ ProjectDirectorySettings: () => null }))
vi.mock('@/features/forge-environment/public-api', () => ({ ProjectEnvironment: () => null }))

const project: RegistryProject = { id: 'forge', metadata: { name: 'Forge', localPath: 'D:/forge', repoType: 'git',
  owner: '', repoUrl: '', defaultBranch: 'main', devUrl: '', testUrl: '' },
  state: 'AI_READY', profileVersion: 1, createdAt: 0, updatedAt: 0 }
const other = { ...project, id: 'other', metadata: { ...project.metadata, name: 'Other', localPath: 'D:/other' } }
const snapshot = { branch: 'main', head: '12345678', remote: 'origin', targetBranch: 'main', upstream: 'origin/main',
  token: 'token', ahead: 1, behind: 0, files: [], commits: [], destinations: [], pushBlockedReason: '' } as GitWorkspace
const Location = () => <output data-testid="location">{useLocation().search}</output>
function show(page = false, entry = '/') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[entry]}>{page ? <ProjectRegistryPage /> : <ProjectGitDialog project={project} />}<Location /></MemoryRouter>
  </QueryClientProvider>)
}
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listRegistry).mockResolvedValue([other, project])
  vi.mocked(getGitWorkspace).mockResolvedValue(snapshot)
})

describe('project Git object action', () => {
  it('loads only the clicked project and restores focus and list search after dismissal', async () => {
    show(true)
    const trigger = await screen.findByRole('button', { name: 'Git 操作：Forge' })
    expect(getGitWorkspace).not.toHaveBeenCalled()
    expect(within(screen.getByRole('navigation', { name: '项目库区域' })).queryByRole('button', { name: 'Git 工作区' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索项目' }), { target: { value: 'Forge' } })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Forge · Git 操作' })
    await waitFor(() => expect(getGitWorkspace).toHaveBeenCalledWith('forge'))
    expect(getGitWorkspace).toHaveBeenCalledTimes(1)
    expect(within(dialog).queryByRole('navigation', { name: '选择 Git 项目' })).toBeNull()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('textbox', { name: '搜索项目' })).toHaveValue('Forge')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('keeps the pending push context until success and prevents duplicate submission', async () => {
    let complete!: (value: { message: string }) => void
    vi.mocked(pushGitWorkspace).mockImplementation(() => new Promise(resolve => { complete = resolve }))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Git 操作：Forge' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Push 当前分支' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Push 当前分支' }))
    expect(await screen.findByText('推送进行中，请等待结果后关闭。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭 Git 操作' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在推送…' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    complete({ message: '推送成功' })
    expect(await screen.findByText(/推送成功/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭 Git 操作' })).toBeEnabled())
    expect(pushGitWorkspace).toHaveBeenCalledExactlyOnceWith('forge', 'token')
    fireEvent.click(screen.getByRole('button', { name: '关闭 Git 操作' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('allows recovery and closing after a read failure', async () => {
    vi.mocked(getGitWorkspace).mockRejectedValue(new Error('项目目录不可访问'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Git 操作：Forge' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('项目目录不可访问')
    expect(screen.getByRole('button', { name: 'Push 当前分支' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '关闭 Git 操作' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('maps legacy Git navigation to the project list without choosing a repository', async () => {
    show(true, '/tools/project-workspace?section=git')
    await screen.findByRole('button', { name: 'Git 操作：Forge' })
    expect(screen.getByTestId('location')).toHaveTextContent('section=systems')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(getGitWorkspace).not.toHaveBeenCalled()
  })
})
