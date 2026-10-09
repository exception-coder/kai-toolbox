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
    expect(mocks.importing).toHaveBeenCalledWith('preview-home-a', ['home-a'])
    expect(onOpenSession).not.toHaveBeenCalled()
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
    expect(screen.getByRole('checkbox', { name: '选择 无效目录' })).toBeDisabled()
  })
})
