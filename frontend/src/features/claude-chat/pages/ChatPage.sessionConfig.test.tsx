import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPage } from './ChatPage'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import type { ProviderProfile } from '../providerProfiles'
import type { WorkspaceList } from '../types'
import { newSessionPreferenceKey, saveNewSessionPreferences } from '../lib/newSessionPreferences'

const testRuntime = vi.hoisted(() => ({
  profiles: undefined as ProviderProfile[] | undefined,
  roots: [] as WorkspaceList['roots'],
  chat: {
    open: vi.fn(),
    sessionId: 'session-config-regression',
    state: 'ready',
    items: [],
    models: [{ value: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol' }],
    currentEngine: 'codex',
    currentProviderKind: 'official',
    currentProviderBaseUrl: null,
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

vi.mock('../runtime/ChatRuntimeContext', () => ({
  useChatRuntime: () => ({ chat: { ...testRuntime.chat }, setFloating: vi.fn(), setMinimized: vi.fn(), setVoiceMode: vi.fn(), getReturnRoute: vi.fn(), gestureOn: false, toggleGesture: vi.fn(), gestureStatus: 'idle' }),
}))
vi.mock('@/shell/UnifiedTitleBar', () => ({ useUnifiedTitleBarSlot: () => null }))
vi.mock('@/shell/MobileNavigationContext', () => ({ useMobileNavigation: () => null }))
vi.mock('@/shell/useMockMode', () => ({ useMockMode: () => ({ enabled: false }) }))
vi.mock('../providerProfiles', async importOriginal => ({ ...(await importOriginal<typeof import('../providerProfiles')>()),
  loadProfiles: () => testRuntime.profiles ? Promise.resolve(testRuntime.profiles) : new Promise(() => {}) }))
vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  listSessions: async () => [{ id: 'session-config-regression', engine: 'codex', providerKind: 'official', cwd: 'D:/test', title: 'Test' }],
  listEngineCatalog: async () => ({ engines: [] }),
  fetchCodexHomes: async () => [],
  getReviewRelations: async () => null,
  getSessionSiteConfiguration: async () => ({ quickSiteIds: [], customSites: [] }),
  listSessionProjectDirectories: async () => [],
  fetchSessionUsage: async () => null,
  listWorkspaces: async () => ({ roots: testRuntime.roots, scannedAt: 'test' }),
  fetchProviderModels: async () => ({ models: [] }),
}))

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  testRuntime.profiles = undefined
  testRuntime.roots = []
  testRuntime.chat.open.mockClear()
  testRuntime.chat.currentEngine = 'codex'
  testRuntime.chat.currentProviderKind = 'official'
  testRuntime.chat.models = [{ value: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol' }]
})

function mountChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={['/tools/claude-chat']}><ConfirmProvider><ChatPage /></ConfirmProvider></MemoryRouter></QueryClientProvider></StrictMode>)
}

async function openNewSessionForm() {
  fireEvent.click(within(await screen.findByRole('banner')).getByRole('button', { name: '新建会话' }))
}

describe('ChatPage session configuration', () => {
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
  it('restores local choices, uses current provider configuration and survives workspace reordering', async () => {
    testRuntime.profiles = [{ id: 'gateway', name: '测试服务商', model: 'current-model', hasKey: true, baseUrl: 'https://gateway.invalid' }]
    testRuntime.roots = [{ root: 'D:/first', exists: true, dirs: [] }, { root: 'D:/second', exists: true, dirs: [] }]
    saveNewSessionPreferences(undefined, { workspaceRoot: 'D:/second', cwd: 'D:/second/project', engine: 'codex', providerId: 'gateway' })
    const first = mountChat()
    await openNewSessionForm()
    expect(await screen.findByRole('button', { name: 'second', pressed: true })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '测试服务商', pressed: true })).toBeInTheDocument()
    expect(screen.getByLabelText('目录路径')).toHaveValue('D:/second/project')
    fireEvent.click(screen.getByRole('button', { name: '开始会话' }))
    expect(testRuntime.chat.open).toHaveBeenCalledWith('D:/second/project', 'current-model', undefined, 'codex',
      { providerProfileId: 'gateway', apiBaseUrl: 'https://gateway.invalid' }, undefined)
    const stored = JSON.parse(localStorage.getItem(newSessionPreferenceKey())!)
    expect(stored).toEqual({ version: 1, workspaceRoot: 'D:/second', cwd: 'D:/second/project', engine: 'codex', providerId: 'gateway' })
    first.unmount()
    testRuntime.roots.reverse()
    mountChat()
    await openNewSessionForm()
    expect(await screen.findByRole('button', { name: 'second', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Codex', pressed: true })).toBeInTheDocument()
  })
  it('requires an explicit replacement when the remembered provider has been removed', async () => {
    testRuntime.profiles = []
    saveNewSessionPreferences(undefined, { workspaceRoot: '', cwd: 'D:/work', engine: 'codex', providerId: 'removed' })
    mountChat()
    await openNewSessionForm()
    expect(await screen.findByText(/上次选择的服务商已不可用/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始会话' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '官方默认' })).toHaveAttribute('aria-pressed', 'false')
    expect(testRuntime.chat.open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '官方默认' }))
    expect(screen.getByRole('button', { name: '开始会话' })).toBeEnabled()
    expect(JSON.parse(localStorage.getItem(newSessionPreferenceKey())!).providerId).toBe('removed')
  })
})
