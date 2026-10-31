import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPage } from './ChatPage'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import type { ProviderProfile } from '../providerProfiles'
import type { ClaudeChatSessionView, EngineCatalogEntry, WorkspaceList } from '../types'
import { newSessionPreferenceKey, saveNewSessionPreferences } from '../lib/newSessionPreferences'
import { fetchCodexHomes, uploadAttachment } from '../api'
import { saveCodexHomePreference } from '../lib/codexHomePref'
import { saveWorkingDirectory } from '../api/savedWorkingDirectories'
import { registerWorkspaceRoot } from '@/features/project-workspace/public-api'
import { browseWorkingDirectory } from '../api/workingDirectories'

const testRuntime = vi.hoisted(() => ({
  profiles: undefined as ProviderProfile[] | undefined,
  roots: [] as WorkspaceList['roots'],
  oldCodexSessions: [] as Partial<ClaudeChatSessionView>[],
  savedDirectories: [] as string[],
  engines: undefined as EngineCatalogEntry[] | undefined,
  chat: {
    open: vi.fn(),
    send: vi.fn(), steer: vi.fn(), enqueue: vi.fn(), interrupt: vi.fn(),
    setModel: vi.fn(), setCodexOptions: vi.fn(), modelsRefreshing: false,
    sessionId: 'session-config-regression',
    state: 'ready',
    items: [],
    models: [{ value: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol' }],
    currentEngine: 'codex',
    currentProviderKind: 'official',
    currentProviderBaseUrl: null as string | null,
    currentModel: 'gpt-5.6-sol',
    mode: 'default',
    codexReasoningEffort: 'low',
    codexSpeed: 'default',
    running: false,
    pendingSessions: [],
    backgroundTasks: [],
    queued: [],
    slashCommands: [],
    historyLoading: false,
    historyExhausted: true,
    providerDiag: [],
    turnTokens: 0,
  },
}))
const previewCalls = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), close: vi.fn() }))
vi.mock('@/features/project-workspace/public-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/project-workspace/public-api')>()), registerWorkspaceRoot: vi.fn(),
}))
vi.mock('../api/workingDirectories', () => ({ browseWorkingDirectory: vi.fn(), listDirectoryRoots: async () => ['D:/'] }))
vi.mock('../api/savedWorkingDirectories', () => ({
  listSavedWorkingDirectories: async () => testRuntime.savedDirectories,
  saveWorkingDirectory: vi.fn(), removeSavedWorkingDirectory: vi.fn(),
}))
vi.mock('@/features/browser-request/preview/api', () => ({
  previewResources: async () => [{ id: 'sales-test', name: '销售智能体', environment: 'TEST', username: 'qa', baseUrl: 'https://sales.example/app?view=home' }],
  createPreview: previewCalls.create, getPreview: previewCalls.get, closePreview: previewCalls.close,
}))

vi.mock('../runtime/ChatRuntimeContext', () => ({
  useChatRuntime: () => ({ chat: { ...testRuntime.chat }, setFloating: vi.fn(), setMinimized: vi.fn(), getReturnRoute: vi.fn(), gestureOn: false, toggleGesture: vi.fn(), gestureStatus: 'idle' }),
}))
vi.mock('@/shell/UnifiedTitleBar', () => ({ useUnifiedTitleBarSlot: () => null }))
vi.mock('@/shell/MobileNavigationContext', () => ({ useMobileNavigation: () => null }))
vi.mock('@/shell/useMockMode', () => ({ useMockMode: () => ({ enabled: false }) }))
vi.mock('../browserNotify', () => ({ ensureNotifyPermission: vi.fn() }))
vi.mock('../providerProfiles', async importOriginal => ({ ...(await importOriginal<typeof import('../providerProfiles')>()),
  loadProfiles: () => testRuntime.profiles ? Promise.resolve(testRuntime.profiles) : new Promise(() => {}) }))
vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  listSessions: async () => [{ id: 'session-config-regression', engine: 'codex', providerKind: 'official', cwd: 'D:/test', title: 'Test' }, ...testRuntime.oldCodexSessions],
  listEngineCatalog: async () => ({ engines: testRuntime.engines ?? ['claude', 'codex', 'qwen', 'opencode', 'pi', 'copilot'].map(id => ({
    id, displayName: id, selectable: true, availability: 'stable', probe: { status: 'ready' }, capabilities: [],
  } as EngineCatalogEntry)) }),
  fetchCodexHomes: vi.fn().mockResolvedValue([]),
  getReviewRelations: async () => null,
  getSessionSiteConfiguration: async () => ({ quickSiteIds: [], customSites: [] }),
  listSessionProjectDirectories: async () => [],
  fetchSessionUsage: async () => null,
  listWorkspaces: async () => ({ roots: testRuntime.roots, scannedAt: 'test' }),
  fetchProviderModels: async () => ({ models: [] }),
  uploadAttachment: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchCodexHomes).mockReset().mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  testRuntime.profiles = undefined
  testRuntime.roots = []
  testRuntime.oldCodexSessions = []
  testRuntime.savedDirectories = []
  testRuntime.engines = undefined
  vi.mocked(registerWorkspaceRoot).mockReset()
  vi.mocked(browseWorkingDirectory).mockReset()
  vi.mocked(saveWorkingDirectory).mockReset()
  testRuntime.chat.open.mockClear()
  testRuntime.chat.send.mockClear()
  testRuntime.chat.steer.mockClear()
  testRuntime.chat.enqueue.mockClear()
  testRuntime.chat.setModel.mockClear()
  testRuntime.chat.setCodexOptions.mockClear()
  testRuntime.chat.running = false
  testRuntime.chat.currentProviderBaseUrl = null
  testRuntime.chat.currentEngine = 'codex'
  testRuntime.chat.currentProviderKind = 'official'
  testRuntime.chat.codexSpeed = 'default'
  testRuntime.chat.models = [{ value: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol' }]
  testRuntime.chat.sessionId = 'session-config-regression'
  vi.mocked(uploadAttachment).mockReset()
  previewCalls.create.mockReset(); previewCalls.get.mockReset(); previewCalls.close.mockReset()
})

function mountChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={['/tools/claude-chat']}><ConfirmProvider><ChatPage /></ConfirmProvider></MemoryRouter></QueryClientProvider></StrictMode>)
  return { ...view, queryClient: client }
}

async function openNewSessionForm() {
  fireEvent.click(within(await screen.findByRole('banner')).getByRole('button', { name: '新建会话' }))
}

async function pickChoice(name: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name }))
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

async function openNewSessionSettings() {
  fireEvent.click(screen.getByRole('button', { name: '工作区与运行设置' }))
  return within(await screen.findByRole('dialog', { name: '工作区与运行设置' }))
}

describe('ChatPage session configuration', () => {
  it('registers a workspace from the drawer, retains input after failure and selects the refreshed root on retry', async () => {
    testRuntime.profiles = []
    testRuntime.roots = [{ root: 'D:/work', exists: true, dirs: [] }]
    vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'D:/projects', parent: 'D:/', directories: [], truncated: false })
    vi.mocked(registerWorkspaceRoot).mockRejectedValueOnce(new Error('登记失败，请重试')).mockImplementationOnce(async () => {
      testRuntime.roots.push({ root: 'D:/projects', exists: true, dirs: [] })
    })
    mountChat()
    await openNewSessionForm()
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    const drawer = within(await screen.findByRole('dialog', { name: '新建工作区' }))
    fireEvent.change(drawer.getByLabelText('工作区目录'), { target: { value: 'D:/projects' } })
    fireEvent.click(drawer.getByRole('button', { name: '保存并使用工作区' }))
    expect(await drawer.findByRole('alert')).toHaveTextContent('登记失败，请重试')
    expect(drawer.getByLabelText('工作区目录')).toHaveValue('D:/projects')
    fireEvent.click(drawer.getByRole('button', { name: '保存并使用工作区' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: '工作区' })).toHaveTextContent('projects')
    expect(registerWorkspaceRoot).toHaveBeenCalledTimes(2)
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })

  it('uses only confirmed available engines and blocks creation when the catalog becomes unavailable', async () => {
    testRuntime.profiles = []
    testRuntime.roots = [{ root: 'D:/work', exists: true, dirs: [] }]
    testRuntime.engines = ['codex', 'pi'].map(id => ({ id, displayName: id, selectable: id === 'pi', availability: 'stable',
      probe: { status: id === 'pi' ? 'ready' : 'dependencyMissing' }, capabilities: [] } as EngineCatalogEntry))
    saveNewSessionPreferences(undefined, { workspaceRoot: 'D:/work', cwd: 'D:/work', engine: 'codex', providerId: '' })
    const view = mountChat()
    await openNewSessionForm()
    expect(await screen.findByRole('button', { name: 'Pi', pressed: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Codex' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^按最近配置创建会话/ })).toBeDisabled()
    view.queryClient.setQueryData(['claude-chat-engine-catalog'], { engines: [], error: '运行目录不可用' })
    await waitFor(() => expect(screen.getByRole('button', { name: '创建会话' })).toBeDisabled())
    expect(screen.getByRole('button', { name: '查看引擎状态' })).toBeInTheDocument()
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })
  it('clears the selected project when switching workspaces and creates once at the explicit root', async () => {
    testRuntime.profiles = []
    testRuntime.roots = [{ root: 'D:/first', exists: true, dirs: [{ name: 'project', path: 'D:/first/project' }] },
      { root: 'D:/second', exists: true, dirs: [] }]
    saveNewSessionPreferences(undefined, { workspaceRoot: 'D:/first', cwd: 'D:/first/project', engine: 'codex', providerId: '' })
    mountChat()
    await openNewSessionForm()
    await waitFor(() => expect(screen.getByRole('combobox', { name: '工作区' })).toBeEnabled())
    expect(screen.getByRole('combobox', { name: '项目' })).toHaveTextContent('project')
    await pickChoice('工作区', 'second')
    expect(screen.getByRole('combobox', { name: '项目' })).toHaveTextContent('不选项目')
    expect(screen.getByText('未选项目，将在 second 工作区中执行')).toBeInTheDocument()
    const create = screen.getByRole('button', { name: '创建会话' })
    fireEvent.click(create); fireEvent.click(create)
    expect(testRuntime.chat.open).toHaveBeenCalledExactlyOnceWith('D:/second', undefined, undefined, 'codex', { codexHome: undefined }, undefined)
  })

  it('does not silently replace a missing project or offer its recent shortcut', async () => {
    testRuntime.profiles = []
    testRuntime.roots = [{ root: 'D:/work', exists: true, dirs: [] }]
    saveNewSessionPreferences(undefined, { workspaceRoot: 'D:/work', cwd: 'D:/work/deleted', engine: 'codex', providerId: '' })
    mountChat()
    await openNewSessionForm()
    expect(await screen.findByText(/上次项目不在当前工作区/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^按最近配置创建会话/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建会话' })).toBeDisabled()
    await pickChoice('项目', '不选项目 · 使用工作区')
    fireEvent.click(screen.getByRole('button', { name: '创建会话' }))
    expect(testRuntime.chat.open).toHaveBeenCalledExactlyOnceWith('D:/work', undefined, undefined, 'codex', { codexHome: undefined }, undefined)
  })

  it('refreshes and selects the registered workspace after saving a previously bookmarked directory', async () => {
    testRuntime.profiles = []
    testRuntime.roots = [{ root: 'D:/work', exists: true, dirs: [] }]
    testRuntime.savedDirectories = ['D:/projects']
    vi.mocked(saveWorkingDirectory).mockImplementation(async () => {
      testRuntime.roots = [...testRuntime.roots, { root: 'D:/projects', exists: true, dirs: [{ name: 'agent', path: 'D:/projects/agent' }] }]
      return ['D:/projects']
    })
    const view = mountChat()
    await openNewSessionForm()
    fireEvent.click(await screen.findByRole('button', { name: 'Codex' }))
    await openNewSessionSettings()
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前目录' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'D:/projects' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: '工作区' })).toHaveTextContent('projects'))
    expect(screen.getByRole('button', { name: 'Codex', pressed: true })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^会话别名/)).not.toBeInTheDocument()
    expect(view.queryClient.getQueryData<WorkspaceList>(['claude-chat-workspaces', 'local'])?.roots.at(-1)?.dirs[0].path).toBe('D:/projects/agent')
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })

  it('uses discovered Auth directories instead of historical bindings or remembered preferences', async () => {
    const defaultHome = 'C:/Users/test/.codex'
    const removedHomes = ['dy', 'zk', 'wz', 'pro', 'yx'].map(name => `C:/Users/test/.codex-account-${name}`)
    testRuntime.oldCodexSessions = removedHomes.map((codexHome, index) => ({
      id: `old-auth-${index}`, engine: 'codex', providerKind: 'official', codexHome, cwd: 'D:/test', title: 'Old auth',
    }))
    saveCodexHomePreference(removedHomes[0])
    vi.mocked(fetchCodexHomes).mockResolvedValue([defaultHome])
    mountChat()
    fireEvent.click(await screen.findByRole('button', { name: /^会话配置，当前/ }))
    const config = within(await screen.findByRole('dialog', { name: '会话配置' }))
    fireEvent.click(config.getByRole('button', { name: /配置 Codex 模型/ }))
    fireEvent.click(config.getByRole('button', { name: '高级' }))
    await waitFor(() => expect(config.getByRole('button', { name: /Auth 目录/ })).toBeEnabled())
    fireEvent.click(config.getByRole('button', { name: /Auth 目录/ }))
    expect(config.getByRole('button', { name: defaultHome })).toBeInTheDocument()
    for (const removed of removedHomes) expect(config.queryByRole('button', { name: removed })).not.toBeInTheDocument()
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })

  it('rechecks removed Auth directories on config open without falling back to stale data after failure', async () => {
    const defaultHome = 'C:/Users/test/.codex'
    const removedHome = 'C:/Users/test/.codex-account-pro'
    vi.mocked(fetchCodexHomes).mockResolvedValue([defaultHome, removedHome])
    const view = mountChat()
    await waitFor(() => expect(view.queryClient.getQueryState(['claude-chat-codex-homes'])?.status).toBe('success'))
    vi.mocked(fetchCodexHomes).mockResolvedValue([defaultHome])
    fireEvent.click(await screen.findByRole('button', { name: /^会话配置，当前/ }))
    const config = within(await screen.findByRole('dialog', { name: '会话配置' }))
    fireEvent.click(config.getByRole('button', { name: /配置 Codex 模型/ }))
    fireEvent.click(config.getByRole('button', { name: '高级' }))
    await waitFor(() => expect(config.getByRole('button', { name: /Auth 目录/ })).toBeEnabled())
    fireEvent.click(config.getByRole('button', { name: /Auth 目录/ }))
    expect(config.queryByRole('button', { name: removedHome })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog', { name: '会话配置' }), { key: 'Escape' })
    vi.mocked(fetchCodexHomes).mockRejectedValue(new Error('discovery unavailable'))
    fireEvent.click(await screen.findByRole('button', { name: /^会话配置，当前/ }))
    const retryConfig = within(await screen.findByRole('dialog', { name: '会话配置' }))
    fireEvent.click(retryConfig.getByRole('button', { name: /配置 Codex 模型/ }))
    fireEvent.click(retryConfig.getByRole('button', { name: '高级' }))
    await waitFor(() => expect(view.queryClient.getQueryState(['claude-chat-codex-homes'])?.status).toBe('error'), { timeout: 3000 })
    await waitFor(() => expect(retryConfig.getByRole('button', { name: /Auth 目录/ })).toBeDisabled())
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })

  it('opens the mobile composer site preview without navigation, auto-creation or losing the draft', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const preview = { id: 'composer-preview', status: 'STARTING', target: { route: '/app?view=home', device: 'phone', scene: 'page' }, environment: 'TEST', account: 'qa', targetOrigin: 'https://sales.example', runtimeVersion: '尚未核验' }
    previewCalls.create.mockResolvedValue(preview); previewCalls.get.mockResolvedValue(preview); previewCalls.close.mockResolvedValue(undefined)
    mountChat()
    const input = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(input, { target: { value: '查看完后继续这个需求' } })
    const trigger = screen.getByRole('button', { name: '更多功能' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: '站点预览' }))
    expect(await screen.findByRole('dialog', { name: '登录并预览页面' })).toBeVisible()
    await screen.findByRole('option', { name: /销售智能体/ })
    expect(previewCalls.create).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('应用与环境'), { target: { value: 'sales-test' } })
    expect(screen.getByLabelText('目标路由')).toHaveValue('/app?view=home')
    fireEvent.change(screen.getByLabelText('设备'), { target: { value: 'phone' } })
    fireEvent.click(screen.getByRole('button', { name: '登录并打开页面' }))
    await waitFor(() => expect(previewCalls.create).toHaveBeenCalledOnce())
    expect(previewCalls.create.mock.calls[0][0]).toMatchObject({ resourceId: 'sales-test', route: '/app?view=home', device: 'phone' })
    expect(previewCalls.create.mock.calls[0][0]).not.toHaveProperty('password')
    await screen.findByText('正在准备独立浏览器')
    fireEvent.click(screen.getByRole('button', { name: '关闭页面预览' }))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(input).toHaveValue('查看完后继续这个需求')
    expect(previewCalls.close).toHaveBeenCalledWith('composer-preview')
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
    expect(testRuntime.chat.send).not.toHaveBeenCalled()
  })
  it('adds dropped files to the current session without sending or replacing the draft', async () => {
    testRuntime.chat.sessionId = 'composer-file-drop-regression'
    vi.mocked(uploadAttachment).mockResolvedValue({ id: 'drop-file', name: '拖入说明.txt', mime: 'text/plain', size: 3, path: '/attachments/drop-file.txt' })
    mountChat()
    const input = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(input, { target: { value: '请先阅读附件' } })
    const file = new File(['abc'], '拖入说明.txt', { type: 'text/plain' })
    const dataTransfer = { types: ['Files'], files: [file], items: [], dropEffect: 'none' }
    fireEvent.dragEnter(input, { dataTransfer })
    expect(screen.getByText('松开即可添加附件')).toBeInTheDocument()
    fireEvent.drop(input, { dataTransfer })
    await screen.findByText('拖入说明.txt')
    expect(uploadAttachment).toHaveBeenCalledExactlyOnceWith('composer-file-drop-regression', file)
    expect(input).toHaveValue('请先阅读附件')
    expect(testRuntime.chat.send).not.toHaveBeenCalled()
    expect(testRuntime.chat.enqueue).not.toHaveBeenCalled()
    expect(testRuntime.chat.steer).not.toHaveBeenCalled()
  })
  it('mobile header switches views without losing the composer draft and retains the directory entry', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    mountChat()
    const input = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(input, { target: { value: '尚未发送的需求' } })
    fireEvent.click(await screen.findByRole('button', { name: '会话工具' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '工作与进度' }))
    fireEvent.click(within(screen.getByRole('group', { name: '工作视图' })).getByRole('button', { name: 'Token 用量' }))
    expect(screen.queryByRole('menu', { name: '会话工具' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '会话工具' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: '会话工具' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '工作与进度' }))
    fireEvent.click(within(screen.getByRole('group', { name: '工作视图' })).getByRole('button', { name: '对话' }))
    expect(screen.getByRole('textbox', { name: '消息输入' })).toHaveValue('尚未发送的需求')
    fireEvent.click(screen.getByRole('button', { name: '会话工具' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '文件与项目' }))
    expect(within(screen.getByRole('menu', { name: '会话工具' })).getByRole('button', { name: /^提交记录/ })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('menuitem', { name: '文件与项目' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    const contextTrigger = screen.getByRole('button', { name: /切换工作空间与对话方式/ })
    fireEvent.click(contextTrigger)
    fireEvent.click(screen.getByRole('button', { name: '切换工作空间' }))
    const sessions = await screen.findByRole('dialog', { name: 'AI 工作区' })
    expect(screen.queryByRole('dialog', { name: '工作空间与对话方式' })).not.toBeInTheDocument()
    fireEvent.keyDown(sessions, { key: 'Escape' })
    await waitFor(() => expect(contextTrigger).toHaveFocus())
    expect(screen.getByRole('textbox', { name: '消息输入' })).toHaveValue('尚未发送的需求')
    expect(testRuntime.chat.send).not.toHaveBeenCalled()
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })
  it('enters and exits mobile focus without replacing input or altering the running task', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    testRuntime.chat.running = true
    mountChat()
    const input = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(input, { target: { value: '仍在编辑的补充需求' } })
    fireEvent.click(screen.getByRole('button', { name: '会话工具' }))
    const menu = within(screen.getByRole('menu', { name: '会话工具' }))
    fireEvent.click(menu.getByRole('menuitem', { name: '阅读与显示' }))
    expect(menu.queryByRole('button', { name: /^全屏显示|^退出全屏|^语音模式/ })).not.toBeInTheDocument()
    expect(menu.getByRole('button', { name: /^弹出悬浮窗/ })).toBeInTheDocument()
    fireEvent.click(menu.getByRole('button', { name: /^专注模式/ }))
    expect(input.closest('.cc-focus-mode')).not.toBeNull()
    expect(screen.getByRole('textbox', { name: '消息输入' })).toBe(input)
    expect(input).toHaveValue('仍在编辑的补充需求')
    expect(screen.getByRole('button', { name: '中断' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }))
    expect(input.closest('.cc-focus-mode')).toBeNull()
    expect(screen.getByRole('textbox', { name: '消息输入' })).toBe(input)
    expect(input).toHaveValue('仍在编辑的补充需求')
    expect(testRuntime.chat.running).toBe(true)
    for (const action of ['open', 'send', 'steer', 'enqueue', 'interrupt'] as const) expect(testRuntime.chat[action]).not.toHaveBeenCalled()
  })

  it('prioritizes two shortcuts and five categories, keeps low-frequency actions out of the root and resets on reopen', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    mountChat()
    const trigger = await screen.findByRole('button', { name: '会话工具' })
    fireEvent.click(trigger)
    const menu = within(screen.getByRole('menu', { name: '会话工具' }))
    expect(menu.getAllByRole('menuitem')).toHaveLength(5)
    expect(menu.getByRole('group', { name: '常用会话操作' })).toBeInTheDocument()
    for (const label of ['工作与进度', '文件与项目', '会话与分享', '阅读与显示', '运行与维护']) expect(menu.getByRole('menuitem', { name: label })).toBeInTheDocument()
    for (const label of ['专注模式', '最新日志', '重启服务', '同步 Codex 项目与会话', '会话用量', '工作目录']) expect(menu.queryByRole('button', { name: label })).not.toBeInTheDocument()
    fireEvent.click(menu.getByRole('menuitem', { name: '运行与维护' }))
    expect(menu.queryByRole('menuitem', { name: '工作与进度' })).not.toBeInTheDocument()
    expect(menu.getByRole('button', { name: /^最新日志/ })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: /^重启服务/ })).toBeInTheDocument()
    fireEvent.click(menu.getByRole('menuitem', { name: '返回会话工具' }))
    expect(menu.getByRole('menuitem', { name: '运行与维护' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    fireEvent.click(trigger)
    expect(within(screen.getByRole('menu', { name: '会话工具' })).getAllByRole('menuitem')).toHaveLength(5)
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
    expect(testRuntime.chat.send).not.toHaveBeenCalled()
  })
  it('collapses the new-session form when reopening mobile tools and preserves unfinished choices', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    testRuntime.profiles = []
    testRuntime.roots = [{ root: 'D:/draft-workspace', exists: true, dirs: [{ name: 'draft-project', path: 'D:/draft-workspace/draft-project' }] }]
    mountChat()
    fireEvent.click(await screen.findByRole('button', { name: '会话工具' }))
    fireEvent.click(within(screen.getByRole('menu', { name: '会话工具' })).getByRole('button', { name: '新建会话' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: '项目' })).toBeEnabled())
    await pickChoice('项目', 'draft-project')
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    fireEvent.click(screen.getByRole('button', { name: '会话工具' }))
    expect(screen.queryByRole('heading', { name: '新建会话' })).not.toBeInTheDocument()
    expect(screen.getByRole('menu', { name: '会话工具' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '会话工具' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: '会话工具' }))
    fireEvent.click(within(screen.getByRole('menu', { name: '会话工具' })).getByRole('button', { name: '新建会话' }))
    expect(screen.getByRole('combobox', { name: '项目' })).toHaveTextContent('draft-project')
    expect(screen.getByRole('button', { name: 'Codex', pressed: true })).toBeInTheDocument()
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })
  it('touch Enter retains the draft without inserting or queuing', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('pointer: coarse'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    testRuntime.chat.running = true
    mountChat()
    const input = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(input, { target: { value: '手机换行' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('手机换行')
    expect(testRuntime.chat.steer).not.toHaveBeenCalled()
    expect(testRuntime.chat.enqueue).not.toHaveBeenCalled()
  })
  it('running desktop Enter inserts, modifier Enter queues and Shift/IME Enter never sends', async () => {
    testRuntime.chat.running = true
    mountChat()
    const input = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(input, { target: { value: '排队任务' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(testRuntime.chat.steer).toHaveBeenCalledExactlyOnceWith('排队任务')
    fireEvent.change(input, { target: { value: '补充说明' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(testRuntime.chat.enqueue).toHaveBeenCalledExactlyOnceWith('补充说明', [])
    fireEvent.change(input, { target: { value: '继续输入' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.compositionEnd(input)
    expect(testRuntime.chat.enqueue).toHaveBeenCalledOnce()
    expect(testRuntime.chat.steer).toHaveBeenCalledOnce()
    expect(testRuntime.chat.send).not.toHaveBeenCalled()
  })
  it('unsupported steering always queues; idle Enter sends', async () => {
    testRuntime.chat.running = true
    testRuntime.chat.currentProviderBaseUrl = 'https://gateway.invalid'
    const first = mountChat()
    const input = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(input, { target: { value: '独立任务' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    expect(testRuntime.chat.steer).not.toHaveBeenCalled()
    expect(testRuntime.chat.enqueue).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { value: '再排队' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(testRuntime.chat.enqueue).toHaveBeenCalledTimes(2)
    first.unmount()
    testRuntime.chat.running = false
    mountChat()
    const idleInput = await screen.findByRole('textbox', { name: '消息输入' })
    fireEvent.change(idleInput, { target: { value: '立即执行' } })
    fireEvent.keyDown(idleInput, { key: 'Enter' })
    expect(testRuntime.chat.send).toHaveBeenCalledExactlyOnceWith('立即执行', [])
  })
  it('keeps manual new-session choices after leaving without starting a session', async () => {
    testRuntime.profiles = [{ id: 'gateway', name: '测试服务商', model: 'current-model', hasKey: true, baseUrl: 'https://gateway.invalid' }]
    testRuntime.roots = [{ root: 'D:/first', exists: true, dirs: [] }, { root: 'D:/second', exists: true, dirs: [{ name: 'project', path: 'D:/second/project' }] }]
    const first = mountChat()
    await openNewSessionForm()
    await waitFor(() => expect(screen.getByRole('combobox', { name: '工作区' })).toBeEnabled())
    await pickChoice('工作区', 'second')
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    await pickChoice('项目', 'project')
    const settings = await openNewSessionSettings()
    await pickChoice('服务商', '测试服务商')
    fireEvent.click(settings.getByRole('button', { name: '返回' }))
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(newSessionPreferenceKey())!)).toEqual({
      version: 1, workspaceRoot: 'D:/second', cwd: 'D:/second/project', engine: 'codex', providerId: 'gateway',
    })
    first.unmount()
    testRuntime.roots.reverse()
    mountChat()
    await openNewSessionForm()
    await waitFor(() => expect(screen.getByRole('combobox', { name: '工作区' })).toHaveTextContent('second'))
    expect(screen.getByRole('button', { name: 'Codex', pressed: true })).toBeInTheDocument()
    expect(await screen.findByText('已选服务商：测试服务商')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '项目' })).toHaveTextContent('project')
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })
  it('用户菜单的导览意图在跳过首次提示后仍可打开，会话工具不再重复提供入口', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    localStorage.setItem('kai-toolbox:vibe-guide:v1:seen', 'true')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={['/tools/claude-chat?guide=1']}>
      <ConfirmProvider><ChatPage /></ConfirmProvider>
    </MemoryRouter></QueryClientProvider></StrictMode>)
    expect(await screen.findByRole('heading', { name: '新建与工作目录' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭导览' }))
    fireEvent.click(screen.getByRole('button', { name: '会话工具' }))
    expect(screen.queryByRole('menuitem', { name: '功能导览' })).not.toBeInTheDocument()
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
  })
  it.each(['pi', 'copilot', 'opencode'])('offers manual gateway model recovery for %s', async engine => {
    testRuntime.chat.currentEngine = engine
    testRuntime.chat.currentProviderKind = 'thirdParty'
    testRuntime.chat.models = []
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={['/tools/claude-chat']}><ConfirmProvider><ChatPage /></ConfirmProvider></MemoryRouter></QueryClientProvider></StrictMode>)
    fireEvent.click(await screen.findByRole('button', { name: /会话配置，当前/ }))
    expect(await screen.findByPlaceholderText('手填网关模型 ID')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新同步网关模型' })).toBeInTheDocument()
  })
  it('opens the configuration while provider profiles are still pending', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={['/tools/claude-chat']}><ConfirmProvider><ChatPage /></ConfirmProvider></MemoryRouter></QueryClientProvider></StrictMode>)
    const trigger = await screen.findByRole('button', { name: /会话配置，当前/ })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(trigger)
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  })
  it('applies a mobile Codex combination through existing settings without sending or queueing a message', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const quickModels = [
      { value: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', description: '', reasoningEfforts: ['low', 'medium', 'high'], fastSupported: true },
      { value: 'gpt-6-astra', displayName: 'GPT-6-Astra', description: '', reasoningEfforts: ['high', 'xhigh'], fastSupported: false },
    ]
    testRuntime.chat.models = quickModels
    testRuntime.chat.codexSpeed = 'fast'
    mountChat()
    expect(screen.queryByRole('button', { name: /会话配置，当前/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '引用项目或规格' })).not.toBeInTheDocument()
    const more = screen.getByRole('button', { name: '更多功能' })
    fireEvent.click(more)
    expect(screen.getByRole('button', { name: '引用项目或规格' })).toBeVisible()
    fireEvent.click(await screen.findByRole('button', { name: /会话配置，当前/ }))
    expect(screen.queryByRole('group', { name: '消息附加功能' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '选择 GPT-6-Astra 深入' }))
    expect(testRuntime.chat.setModel).toHaveBeenCalledExactlyOnceWith('gpt-6-astra')
    expect(testRuntime.chat.setCodexOptions).toHaveBeenCalledExactlyOnceWith('high', 'default')
    expect(testRuntime.chat.send).not.toHaveBeenCalled()
    expect(testRuntime.chat.enqueue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '自定义模型与参数' }))
    expect(screen.getByRole('button', { name: /^推理强度 / })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    await vi.waitFor(() => expect(more).toHaveFocus())
  })
  it('restores local choices, uses current provider configuration and survives workspace reordering', async () => {
    testRuntime.profiles = [{ id: 'gateway', name: '测试服务商', model: 'current-model', hasKey: true, baseUrl: 'https://gateway.invalid' }]
    testRuntime.roots = [{ root: 'D:/first', exists: true, dirs: [] }, { root: 'D:/second', exists: true, dirs: [{ name: 'project', path: 'D:/second/project' }] }]
    saveNewSessionPreferences(undefined, { workspaceRoot: 'D:/second', cwd: 'D:/second/project', engine: 'codex', providerId: 'gateway' })
    const first = mountChat()
    await openNewSessionForm()
    await waitFor(() => expect(screen.getByRole('combobox', { name: '工作区' })).toHaveTextContent('second'))
    expect(await screen.findByText('已选服务商：测试服务商')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '项目' })).toHaveTextContent('project')
    await waitFor(() => expect(screen.getByRole('button', { name: /^按最近配置创建会话/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /^按最近配置创建会话/ }))
    expect(testRuntime.chat.open).toHaveBeenCalledWith('D:/second/project', 'current-model', undefined, 'codex',
      { providerProfileId: 'gateway', apiBaseUrl: 'https://gateway.invalid' }, undefined)
    const stored = JSON.parse(localStorage.getItem(newSessionPreferenceKey())!)
    expect(stored).toEqual({ version: 1, workspaceRoot: 'D:/second', cwd: 'D:/second/project', engine: 'codex', providerId: 'gateway',
      recent: { workspaceRoot: 'D:/second', cwd: 'D:/second/project', engine: 'codex', providerId: 'gateway' } })
    first.unmount()
    testRuntime.roots.reverse()
    mountChat()
    await openNewSessionForm()
    await waitFor(() => expect(screen.getByRole('combobox', { name: '工作区' })).toHaveTextContent('second'))
    expect(screen.getByRole('button', { name: 'Codex', pressed: true })).toBeInTheDocument()
  })
  it('requires an explicit replacement when the remembered provider has been removed', async () => {
    testRuntime.profiles = []
    testRuntime.roots = [{ root: 'D:/work', exists: true, dirs: [] }]
    saveNewSessionPreferences(undefined, { workspaceRoot: '', cwd: 'D:/work', engine: 'codex', providerId: 'removed' })
    mountChat()
    await openNewSessionForm()
    expect(await screen.findByText(/上次选择的服务商已不可用/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建会话' })).toBeDisabled()
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
    const settings = await openNewSessionSettings()
    await pickChoice('服务商', '官方默认')
    fireEvent.click(settings.getByRole('button', { name: '返回' }))
    expect(screen.getByRole('button', { name: '创建会话' })).toBeEnabled()
    expect(JSON.parse(localStorage.getItem(newSessionPreferenceKey())!).providerId).toBe('')
  })
})
