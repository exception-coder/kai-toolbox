import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatPage } from './ChatPage'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'

const testRuntime = vi.hoisted(() => ({
  chat: {
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
vi.mock('../providerProfiles', async importOriginal => ({ ...(await importOriginal<typeof import('../providerProfiles')>()), loadProfiles: () => new Promise(() => {}) }))
vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  listSessions: async () => [{ id: 'session-config-regression', engine: 'codex', providerKind: 'official', cwd: 'D:/test', title: 'Test' }],
  listEngineCatalog: async () => ({ engines: [] }),
  fetchCodexHomes: async () => [],
  getReviewRelations: async () => null,
  getSessionPendingSql: async () => null,
  getSessionSiteConfiguration: async () => ({ quickSiteIds: [], customSites: [] }),
  listSessionProjectDirectories: async () => [],
  fetchSessionUsage: async () => null,
}))

afterEach(() => {
  cleanup()
  testRuntime.chat.currentEngine = 'codex'
  testRuntime.chat.currentProviderKind = 'official'
  testRuntime.chat.models = [{ value: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol' }]
})

describe('ChatPage session configuration', () => {
  it.each(['pi', 'copilot'])('offers manual gateway model recovery for %s', async engine => {
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
})
