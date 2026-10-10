import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexDesktopSyncDialog } from './CodexDesktopSyncDialog'
import type { CodexThreadPage } from '../api/codexDesktopSync'

const mocks = vi.hoisted(() => ({ homes: vi.fn(), projects: vi.fn(), threads: vi.fn(), importing: vi.fn() }))
vi.mock('../api', () => ({ fetchCodexHomes: mocks.homes }))
vi.mock('../api/codexDesktopSync', () => ({
  listCodexNativeProjects: mocks.projects, listCodexNativeThreads: mocks.threads, importCodexNativeThreads: mocks.importing,
}))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/lib/fullscreen-portal', () => ({ useFullscreenPortalContainer: () => undefined }))
afterEach(cleanup)
function page(home: string, id = home, nextCursor: string | null = null): CodexThreadPage {
  return { codexHome: home, previewToken: `preview-${home}`, nextCursor, project: null, fetchedAt: 1000,
    data: [{ thread: { id, title: `会话 ${id}`, cwd: `D:/work/${home}`, projectId: null, model: 'model',
      reasoningEffort: null, createdAt: 1000, updatedAt: 2000, source: 'appServer' }, importedSessionId: null, unavailableReason: null }] }
}
function show() {
  const onOpenChange = vi.fn()
  const onOpenSession = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><CodexDesktopSyncDialog open defaultHome="home-a" onOpenChange={onOpenChange} onOpenSession={onOpenSession} onCreateProject={vi.fn()} /></QueryClientProvider>)
  return { onOpenChange, onOpenSession, client }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.homes.mockResolvedValue(['home-a', 'home-b'])
  mocks.projects.mockResolvedValue({ codexHome: 'home-a', data: [{ id: 'p1', name: '主项目', roots: ['D:/work'] }], nextCursor: null, fetchedAt: 1000 })
  mocks.threads.mockImplementation(async (home: string) => page(home))
  mocks.importing.mockResolvedValue({ added: 1, reused: 0, sessions: [{ sessionId: 'forge-id', threadId: 'home-a', title: '会话 home-a' }] })
})

describe('CodexDesktopSyncDialog', () => {
  it('切换账号不展示旧账号迟到结果，也不沿用旧选择', async () => {
    let resolveA!: (value: CodexThreadPage) => void
    mocks.threads.mockImplementation((home: string) => home === 'home-a'
      ? new Promise<CodexThreadPage>(resolve => { resolveA = resolve }) : Promise.resolve(page(home)))
    show()
    await screen.findByRole('option', { name: 'home-b' })
    fireEvent.change(screen.getByLabelText('Codex 授权目录'), { target: { value: 'home-b' } })
    await screen.findByText('会话 home-b')
    resolveA(page('home-a'))
    await waitFor(() => expect(screen.queryByText('会话 home-a')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '导入所选会话' })).toBeDisabled()
  })

  it('导入只发送当前预览和所选原生 ID，完成后通过原逻辑会话打开', async () => {
    const { onOpenSession } = show()
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 会话 home-a' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选会话' }))
    await screen.findByText('新增 1 个，复用 0 个已有会话。')
    expect(screen.getByText('导入成功')).toBeInTheDocument()
    expect(mocks.importing).toHaveBeenCalledWith('preview-home-a', ['home-a'])
    expect(onOpenSession).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: '选择 会话 home-a' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 会话 home-a' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '本页已全部导入' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '选择本页' }))
    expect(mocks.importing).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '打开导入的会话' }))
    expect(onOpenSession).toHaveBeenCalledWith('forge-id')
  })

  it('按真实项目 ID 查询，翻页后清除本页选择', async () => {
    mocks.threads.mockResolvedValue(page('home-a', 'first', 'next-cursor'))
    show()
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 会话 first' }))
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '导入所选会话' })).toBeDisabled())
    expect(mocks.threads).toHaveBeenCalledWith('home-a', 'next-cursor', '', expect.anything())
    fireEvent.change(screen.getByLabelText('原生项目'), { target: { value: 'p1' } })
    await waitFor(() => expect(mocks.threads).toHaveBeenCalledWith('home-a', '', 'p1', expect.anything()))
    expect(screen.getByText('第 1 页')).toBeInTheDocument()
  })

  it('导入中的关闭和重复提交被保护，失败后保留选择供重试', async () => {
    let reject!: (value: Error) => void
    mocks.importing.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    const { onOpenChange } = show()
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 会话 home-a' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选会话' }))
    await screen.findByRole('button', { name: '正在导入…' })
    expect(screen.getByRole('button', { name: '关闭 Codex 同步' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '关闭 Codex 同步' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    reject(new Error('预览已过期'))
    await screen.findByRole('alert')
    expect(screen.getByRole('checkbox', { name: '选择 会话 home-a' })).toBeChecked()
    expect(screen.getByRole('button', { name: '导入所选会话' })).toBeEnabled()
  })

  it('已导入记录可以直接打开，无效目录不能导入', async () => {
    const data = page('home-a'); data.data[0].importedSessionId = 'existing-id'
    data.data.push({ ...data.data[0], thread: { ...data.data[0].thread, id: 'missing', title: '无效目录' }, importedSessionId: null, unavailableReason: '工作目录不存在' })
    mocks.threads.mockResolvedValue(data)
    const { onOpenSession } = show()
    fireEvent.click(await screen.findByRole('button', { name: '已导入 · 打开' }))
    expect(onOpenSession).toHaveBeenCalledWith('existing-id')
    expect(mocks.importing).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: '选择 会话 home-a' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '选择 无效目录' })).toBeDisabled()
  })

  it('本页全是已导入记录时说明成功状态并阻止再次全选和提交', async () => {
    const data = page('home-a')
    data.data = Array.from({ length: 50 }, (_, index) => ({ ...data.data[0],
      thread: { ...data.data[0].thread, id: `thread-${index}`, title: `已有会话 ${index}` }, importedSessionId: `forge-${index}` }))
    mocks.threads.mockResolvedValue(data)
    show()
    await screen.findByText('本页 50 个会话 · 已导入 50 个')
    expect(screen.getByRole('button', { name: '选择本页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '本页已全部导入' })).toBeDisabled()
    expect(screen.getByText('已导入记录可直接打开，无需重复导入')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '本页已全部导入' }))
    expect(mocks.importing).not.toHaveBeenCalled()
  })

  it('部分导入后刷新失败仍保留确认结果，剩余记录可以继续导入', async () => {
    const data = page('home-a')
    data.data.push({ ...data.data[0], thread: { ...data.data[0].thread, id: 'second', title: '另一会话' } })
    mocks.threads.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('刷新失败')).mockResolvedValue(data)
    const { client } = show()
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 会话 home-a' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选会话' }))
    await screen.findByText('导入成功')
    await screen.findByText(/刷新失败/)
    expect(screen.getByRole('checkbox', { name: '选择 会话 home-a' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '选择 会话 home-a' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 另一会话' })).toBeEnabled()
    expect(client.getQueryData<CodexThreadPage>(['codex-desktop-sync', 'local', 'home-a', 'threads', '', ''])?.data[0].importedSessionId).toBe('forge-id')
    fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '选择本页' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '选择本页' }))
    mocks.importing.mockResolvedValueOnce({ added: 1, reused: 0, sessions: [{ sessionId: 'second-forge', threadId: 'second', title: '另一会话' }] })
    fireEvent.click(screen.getByRole('button', { name: '导入所选会话' }))
    await waitFor(() => expect(mocks.importing).toHaveBeenNthCalledWith(2, 'preview-home-a', ['second']))
    await waitFor(() => expect(screen.getByRole('button', { name: '本页已全部导入' })).toBeDisabled())
  })

  it('服务端确认全部复用时仍显示导入成功并清除整页选择', async () => {
    const data = page('home-a')
    data.data = Array.from({ length: 50 }, (_, index) => ({ ...data.data[0],
      thread: { ...data.data[0].thread, id: `thread-${index}`, title: `原生会话 ${index}` } }))
    mocks.threads.mockResolvedValue(data)
    mocks.importing.mockResolvedValue({ added: 0, reused: 50, sessions: data.data.map(row => ({
      sessionId: `forge-${row.thread.id}`, threadId: row.thread.id, title: row.thread.title })) })
    show()
    await screen.findByText('本页 50 个会话 · 已导入 0 个')
    fireEvent.click(screen.getByRole('button', { name: '选择本页' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选会话' }))
    await screen.findByText('导入成功')
    expect(screen.getByText('新增 0 个，复用 50 个已有会话。')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(50)
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked()
      expect(checkbox).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: '选择本页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '本页已全部导入' })).toBeDisabled()
    expect(mocks.importing).toHaveBeenCalledTimes(1)
  })

  it('确认导入后切换账号不会将相同原生 ID 误标为已导入', async () => {
    mocks.threads.mockImplementation(async (home: string) => page(home, 'shared-id'))
    mocks.importing.mockResolvedValue({ added: 1, reused: 0, sessions: [{ sessionId: 'forge-a', threadId: 'shared-id', title: '会话 shared-id' }] })
    show()
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 会话 shared-id' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选会话' }))
    await screen.findByText('导入成功')
    fireEvent.change(screen.getByLabelText('Codex 授权目录'), { target: { value: 'home-b' } })
    await screen.findByText('D:/work/home-b')
    expect(screen.queryByText('导入成功')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '已导入 · 打开' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '选择 会话 shared-id' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: '选择 会话 shared-id' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '选择本页' })).toBeEnabled()
  })
})
