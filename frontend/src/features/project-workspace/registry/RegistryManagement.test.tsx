import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listProjectCatalog } from './projectCatalogApi'
import { listProjects } from '@/features/projects/public-api'
import { getConfigBlock, updateConfigBlock } from '@/features/config-center/public-api'
import { LocalProjectDiscovery } from './LocalProjectDiscovery'
import { ProjectDirectorySettings } from './ProjectDirectorySettings'
import { ProjectRegistrationForm } from './ProjectRegistrationForm'
import type { RegistryProject } from './types'

vi.mock('./projectCatalogApi', () => ({ listProjectCatalog: vi.fn(), setProjectExcluded: vi.fn() }))
vi.mock('@/features/projects/public-api', () => ({ listProjects: vi.fn(), ProjectCard: () => <div>Git 操作</div> }))
vi.mock('@/features/config-center/public-api', async importOriginal => ({ ...await importOriginal<typeof import('@/features/config-center/public-api')>(), getConfigBlock: vi.fn(), updateConfigBlock: vi.fn() }))

const workspaceId = 'toolbox.claude-chat.workspace'
function provider(children: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>)
}

describe('central project management', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listProjectCatalog).mockResolvedValue([
      { id: 'forge', systemId: '', name: 'Forge', path: 'D:/work/forge', root: 'D:/work', available: true, excluded: false, source: 'DISCOVERED' },
      { id: 'erp', systemId: '', name: 'erp', path: 'D:/work/erp', root: 'D:/work', available: true, excluded: false, source: 'DISCOVERED' },
    ])
    vi.mocked(listProjects).mockResolvedValue({ root: 'D:/work', rootExists: true, scannedAt: '', items: [] })
    vi.mocked(getConfigBlock).mockImplementation(async id => ({ id, name: id, entries: id === workspaceId
      ? [{ key: `${id}.directories-unified`, value: 'true', type: 'string', values: [], overridden: false }, { key: `${id}.roots`, value: null, type: 'list', values: ['D:/old', 'E:/old'], overridden: false }]
      : [{ key: `${id}.root`, value: 'D:/old', values: [], type: 'string', overridden: false }] }))
    vi.mocked(updateConfigBlock).mockResolvedValue({ id: workspaceId, name: '', entries: [] })
  })

  it('uses one catalog without loading a parallel project list', async () => {
    provider(<LocalProjectDiscovery registered={[]} onSelect={vi.fn()} onOpen={vi.fn()} onSettings={vi.fn()} />)
    await screen.findByText('Forge')
    expect(listProjectCatalog).toHaveBeenCalled()
    expect(listProjects).not.toHaveBeenCalled()
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
    fireEvent.change(await screen.findByLabelText('项目目录'), { target: { value: 'D:/new' } })
    fireEvent.click(screen.getByRole('button', { name: '保存项目目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith(workspaceId, { [`${workspaceId}.roots[0]`]: 'D:/new' }, [`${workspaceId}.roots`]))
  })

  it('preserves edited directories after a failed save', async () => {
    vi.mocked(updateConfigBlock).mockRejectedValue(new Error('保存失败，请重试'))
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('项目目录'), { target: { value: 'D:/new' } })
    fireEvent.click(screen.getByRole('button', { name: '保存项目目录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.getByLabelText('项目目录')).toHaveValue('D:/new')
  })

  it('restores the implicit managed directory without requiring a path', async () => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('托管业务源码目录'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存托管业务源码目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith('toolbox.claude-chat.business-workspace',
      { 'toolbox.claude-chat.business-workspace.root': '' }, []))
  })

  it('accepts an explicitly empty unified directory list without legacy fallback', async () => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('项目目录'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存项目目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith(workspaceId,
      { [`${workspaceId}.roots`]: '' }, [`${workspaceId}.roots`]))
    expect(screen.queryByLabelText('默认项目目录')).not.toBeInTheDocument()
  })

  it('replaces hidden prefixes without overwriting the directory list', async () => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('项目隐藏前缀'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存项目目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith(workspaceId,
      { [`${workspaceId}.hidden-prefixes`]: '' }, [`${workspaceId}.hidden-prefixes`]))
  })

  it.each(['0', '-1', '1.5', 'abc'])('rejects invalid scan duration %s without writing', async value => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('项目扫描缓存（秒）'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: '保存项目目录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('正整数')
    expect(updateConfigBlock).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('项目扫描缓存（秒）'), { target: { value: '5' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存项目目录' })).toBeDisabled()
  })

  it('converts the managed Git timeout to milliseconds and preserves the source root', async () => {
    provider(<ProjectDirectorySettings />)
    fireEvent.change(await screen.findByLabelText('托管 Git 命令超时（秒）'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: '保存托管业务源码目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith('toolbox.claude-chat.business-workspace',
      { 'toolbox.claude-chat.business-workspace.command-timeout-ms': '120000' }, []))
  })

  it('offers directory recovery when no usable catalog entries exist', async () => {
    vi.mocked(listProjectCatalog).mockResolvedValue([])
    const settings = vi.fn()
    provider(<LocalProjectDiscovery registered={[]} onSelect={vi.fn()} onOpen={vi.fn()} onSettings={settings} />)
    expect(await screen.findByText(/暂未发现可用项目/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '管理目录' }))
    expect(settings).toHaveBeenCalled()
  })

  it('imports the legacy root and switches the full edited list in one save', async () => {
    vi.mocked(getConfigBlock).mockImplementation(async id => ({ id, name: id, entries: id === workspaceId
      ? [{ key: `${id}.roots`, value: null, type: 'list', values: ['D:/work'], overridden: false }]
      : [{ key: `${id}.root`, value: 'E:/legacy', values: [], type: 'string', overridden: false }] }))
    provider(<ProjectDirectorySettings />)
    expect(await screen.findByLabelText('项目目录')).toHaveValue('D:/work\nE:/legacy')
    fireEvent.change(screen.getByLabelText('项目目录'), { target: { value: 'D:/work' } })
    fireEvent.click(screen.getByRole('button', { name: '保存项目目录' }))
    await waitFor(() => expect(updateConfigBlock).toHaveBeenCalledWith(workspaceId,
      { [`${workspaceId}.roots[0]`]: 'D:/work', [`${workspaceId}.directories-unified`]: 'true' }, [`${workspaceId}.roots`]))
    expect(updateConfigBlock).toHaveBeenCalledTimes(1)
  })

})
