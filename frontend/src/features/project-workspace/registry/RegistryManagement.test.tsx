import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listWorkspaces } from '@/features/claude-chat/public-api'
import { listProjects } from '@/features/projects/public-api'
import { getConfigBlock, updateConfigBlock } from '@/features/config-center/public-api'
import { LocalProjectDiscovery, mergeDiscoveredProjects } from './LocalProjectDiscovery'
import { ProjectDirectorySettings } from './ProjectDirectorySettings'
import { ProjectRegistrationForm } from './ProjectRegistrationForm'
import type { RegistryProject } from './types'

vi.mock('@/features/claude-chat/public-api', () => ({ listWorkspaces: vi.fn() }))
vi.mock('@/features/projects/public-api', () => ({ listProjects: vi.fn(), ProjectCard: () => <div>Git 操作</div> }))
vi.mock('@/features/config-center/public-api', () => ({ getConfigBlock: vi.fn(), updateConfigBlock: vi.fn() }))

const workspaceId = 'toolbox.claude-chat.workspace'
function provider(children: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>)
}

describe('central project management', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listWorkspaces).mockResolvedValue({ scannedAt: '', roots: [{ root: 'D:/work', exists: true, dirs: [
      { name: 'forge', alias: 'Forge', path: 'D:/work/forge' }, { name: 'erp', path: 'D:/work/erp' },
    ] }] })
    vi.mocked(listProjects).mockResolvedValue({ root: 'D:/work', rootExists: true, scannedAt: '', items: [] })
    vi.mocked(getConfigBlock).mockImplementation(async id => ({ id, name: id, entries: id === workspaceId
      ? [{ key: `${id}.roots`, value: null, type: 'list', values: ['D:/old', 'E:/old'], overridden: false }]
      : [{ key: `${id}.root`, value: 'D:/old', overridden: false }] }))
    vi.mocked(updateConfigBlock).mockResolvedValue({ id: workspaceId, name: '', entries: [] })
  })

  it('merges Windows path variants while preserving project operations and aliases', () => {
    const merged = mergeDiscoveredProjects([{ name: 'Forge', path: 'd:/work/forge/' }], [
      { name: 'forge', path: 'D:\\work\\forge', type: 'git', branch: 'main', lastModified: '' },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ name: 'Forge', details: { branch: 'main' } })
  })

  it('searches discovery and selects an unregistered directory without navigation', async () => {
    const select = vi.fn()
    provider(<LocalProjectDiscovery registered={[]} onSelect={select} onOpen={vi.fn()} onSettings={vi.fn()} />)
    await screen.findByText('Forge')
    fireEvent.change(screen.getByLabelText('搜索本地项目'), { target: { value: 'erp' } })
    fireEvent.click(screen.getByRole('button', { name: '接入项目库' }))
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ path: 'D:/work/erp' }))
  })

  it('opens a registered canonical path instead of offering duplicate registration', async () => {
    const open = vi.fn()
    provider(<LocalProjectDiscovery registered={[{ id: 'one', metadata: { localPath: 'd:\\work\\forge' } } as RegistryProject]} onSelect={vi.fn()} onOpen={open} onSettings={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开已登记项目' }))
    expect(open).toHaveBeenCalledWith('one')
  })

  it('prefills registration from discovery and leaves manual fields editable', () => {
    provider(<ProjectRegistrationForm initial={{ name: 'ERP', localPath: 'D:/work/erp' }} onSaved={vi.fn()} />)
    expect(screen.getByLabelText(/系统名称/)).toHaveValue('ERP')
    expect(screen.getByLabelText(/本地代码目录/)).toHaveValue('D:/work/erp')
    expect(screen.queryByText('从已发现的工作区选择')).not.toBeInTheDocument()
  })

  it('replaces workspace roots in the existing config block without changing other settings', async () => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('工作区目录'), { target: { value: 'D:/new' } })
    fireEvent.click(screen.getByRole('button', { name: '保存工作区目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith(workspaceId, { [`${workspaceId}.roots[0]`]: 'D:/new' }, [`${workspaceId}.roots`]))
  })

  it('preserves edited directories after a failed save', async () => {
    vi.mocked(updateConfigBlock).mockRejectedValue(new Error('保存失败，请重试'))
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('工作区目录'), { target: { value: 'D:/new' } })
    fireEvent.click(screen.getByRole('button', { name: '保存工作区目录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.getByLabelText('工作区目录')).toHaveValue('D:/new')
  })

  it('restores the implicit managed directory without requiring a path', async () => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('托管业务源码目录'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存托管业务源码目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith('toolbox.claude-chat.business-workspace',
      { 'toolbox.claude-chat.business-workspace.root': '' }, []))
  })

  it('still rejects an empty required project directory', async () => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('默认项目目录'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存默认项目目录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('请填写一个完整的本地目录')
    expect(updateConfigBlock).not.toHaveBeenCalled()
  })

  it('keeps explicit missing roots visible with a directory settings action', async () => {
    vi.mocked(listWorkspaces).mockResolvedValue({ scannedAt: '', roots: [{ root: 'D:/missing', exists: false, dirs: [] }] })
    const settings = vi.fn()
    provider(<LocalProjectDiscovery registered={[]} onSelect={vi.fn()} onOpen={vi.fn()} onSettings={settings} />)
    expect(await screen.findByText(/目录不可用：D:\/missing/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '管理目录' }))
    expect(settings).toHaveBeenCalled()
  })

})
