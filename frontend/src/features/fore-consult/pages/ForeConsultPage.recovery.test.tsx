import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ForeConsultPage } from './ForeConsultPage'
import type { ConsultSessionView } from '../api'

const calls = vi.hoisted(() => ({
  history: vi.fn(), runtime: vi.fn(), switchTo: vi.fn(), start: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { roles: ['USER'] } }) }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/components/ui/prompt-dialog', () => ({ usePrompt: () => vi.fn() }))
vi.mock('@/features/claude-chat/public-api', () => ({
  useClaudeChatSocket: () => ({ items: [], sessionId: null, switchTo: calls.switchTo }),
  listSessions: calls.runtime, fetchCodexModels: async () => [], CodexSessionOptions: () => null,
}))
vi.mock('../components/ConsultConversation', () => ({ ConsultConversation: () => <div>原咨询对话</div> }))
vi.mock('../api', async original => ({ ...await original<typeof import('../api')>(),
  listWorkspaces: async () => ({ roots: [{ root: 'D:/workspace', exists: true,
    dirs: [{ name: 'erp', path: 'D:/workspace/erp' }] }] }),
  listSystemPrefs: async () => [{ systemName: 'erp', systemSourcePath: 'D:/workspace/erp',
    alias: 'ERP', visible: true, sortOrder: 0 }],
  listConsults: calls.history, startConsult: calls.start,
  getTopology: async () => ({ links: [] }), listCodexHomes: async () => [],
  fetchProjectModules: async () => ({ modules: [] }),
  getBusinessConsultModelPolicy: async () => ({ model: 'test-model', codexHome: 'C:/test-codex' }),
}))

let client: QueryClient
const pending: ConsultSessionView = {
  sessionId: 'original-consult', devSessionId: 'original-runtime', archiveStatus: 'PENDING',
  systemName: 'erp', systemSourcePath: 'D:/workspace/erp', moduleNames: [],
  role: 'BIZ', questionTitle: '原问题', userId: '1', creatorName: null,
  evidenceSystems: [], evidenceRouteSnapshot: null, promptSnapshot: null,
  rawReferenceJson: null, parseStatus: 'PENDING', engine: 'codex', model: null,
  codexReasoningEffort: null, codexSpeed: null, codexHome: null,
  orchestrationVersion: 'v4', errorMsg: null, createdAt: 1, endedAt: null,
  turnCount: 0, turns: [], feedback: [],
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  calls.history.mockReset().mockResolvedValue([])
  calls.runtime.mockReset().mockResolvedValue([])
  calls.switchTo.mockReset(); calls.start.mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals() })
function mount() { render(<QueryClientProvider client={client}><ForeConsultPage /></QueryClientProvider>) }

it('starts from the question without selecting a system or entering a title', async () => {
  calls.start.mockReturnValue(new Promise(() => {}))
  mount()
  const question = await screen.findByRole('textbox', { name: '业务问题' })
  await waitFor(() => expect(question).toBeEnabled())
  expect(screen.getByRole('combobox', { name: '系统定位方式' })).toHaveValue('')
  fireEvent.change(question, { target: { value: '为什么订单价格\n下限变成了65' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask Forge' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ask Forge' }))
  await waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
  expect(calls.start.mock.calls[0][0]).toMatchObject({ autoDetect: true, systemName: '', systemSourcePath: '' })
  expect(calls.start.mock.calls[0][0].questionTitle).toMatch(/^\d{6}-为什么订单价格 下限变成了65$/)
})

it('allows an optional system correction without discarding the question draft', async () => {
  mount()
  const question = await screen.findByRole('textbox', { name: '业务问题' })
  await waitFor(() => expect(question).toBeEnabled())
  fireEvent.change(question, { target: { value: '请核查截图' } })
  fireEvent.change(screen.getByRole('combobox', { name: '系统定位方式' }), { target: { value: 'erp' } })
  expect(question).toHaveValue('请核查截图')
  expect(calls.start).not.toHaveBeenCalled()
})

it('allows a new question after authoritative history succeeds even when runtime hints fail', async () => {
  calls.runtime.mockRejectedValue(new Error('HTTP 500'))
  mount()
  const project = await screen.findByRole('button', { name: 'ERP' })
  await waitFor(() => expect(project).toBeEnabled())
  project.setPointerCapture = vi.fn()
  fireEvent.pointerDown(project, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(project, { pointerId: 1, clientX: 100, clientY: 100 })
  expect(screen.getByPlaceholderText(/向 Forge 询问 ERP/)).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(calls.start).not.toHaveBeenCalled()
})

it('does not wait for an unrelated runtime listing that never settles', async () => {
  calls.runtime.mockReturnValue(new Promise(() => {}))
  mount()
  await waitFor(() => expect(screen.getByRole('button', { name: 'ERP' })).toBeEnabled())
})

it('restores the original pending consultation once without resending a question if runtime hints fail', async () => {
  calls.history.mockResolvedValue([pending])
  calls.runtime.mockRejectedValue(new Error('HTTP 500'))
  mount()
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
  expect(calls.start).not.toHaveBeenCalled()
})

it('keeps entry locked on history failure and retries history before restoring the same session', async () => {
  calls.history.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValue([pending])
  mount()
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'ERP' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /^重试$/ }))
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
  expect(calls.start).not.toHaveBeenCalled()
})

it('does not trust a cached empty history while the fresh history request is still pending', async () => {
  let resolve!: (value: ConsultSessionView[]) => void
  client.setQueryData(['fore-consult-sessions'], [])
  calls.history.mockReturnValue(new Promise<ConsultSessionView[]>(done => { resolve = done }))
  mount()
  expect(await screen.findByRole('button', { name: 'ERP' })).toBeDisabled()
  await act(async () => resolve([pending]))
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
})
