import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ForeConsultPage } from './ForeConsultPage'
import type { ConsultSessionView } from '../api'

const calls = vi.hoisted(() => ({
  history: vi.fn(), own: vi.fn(), runtime: vi.fn(), switchTo: vi.fn(), start: vi.fn(), continuation: vi.fn(), archive: vi.fn(), detail: vi.fn(),
}))
const viewport = vi.hoisted(() => ({ phone: false }))
vi.mock('../consultContinuation', () => ({ requestConsultContinuation: calls.continuation }))
vi.mock('../useConsultLayout', () => ({ useConsultLayout: () => ({ phone: viewport.phone, compact: viewport.phone, layout: viewport.phone ? 'phone' : 'desktop' }) }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { username: 'admin', roles: ['USER'] } }) }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/components/ui/prompt-dialog', () => ({ usePrompt: () => vi.fn() }))
vi.mock('@/features/claude-chat/public-api', () => ({
  useClaudeChatSocket: () => ({ items: [], sessionId: null, switchTo: calls.switchTo }),
  listSessions: calls.runtime, fetchCodexModels: async () => [], CodexSessionOptions: () => null,
  renameSession: vi.fn(async () => {}),
}))
vi.mock('../components/ConsultConversation', () => ({ ConsultConversation: ({ readOnly }: { readOnly?: boolean }) => <div>原咨询对话{readOnly && <span>归档只读</span>}</div> }))
vi.mock('../components/ConsultDocuments', () => ({ ConsultDocuments: () => null }))
vi.mock('../api', async original => ({ ...await original<typeof import('../api')>(),
  listWorkspaces: async () => ({ roots: [{ root: 'D:/workspace', exists: true,
    dirs: [{ name: 'erp', path: 'D:/workspace/erp' }] }] }),
  listSystemPrefs: async () => [{ systemName: 'erp', systemSourcePath: 'D:/workspace/erp',
    alias: 'ERP', visible: true, sortOrder: 0 }],
  listConsults: calls.history, startConsult: calls.start, archiveConsult: calls.archive,
  listOwnRecentConsult: calls.own,
  getConsult: calls.detail,
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
  viewport.phone = false
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  calls.history.mockReset().mockResolvedValue([])
  calls.own.mockReset().mockImplementation(() => calls.history())
  calls.runtime.mockReset().mockResolvedValue([])
  calls.switchTo.mockReset(); calls.start.mockReset(); calls.archive.mockReset(); calls.continuation.mockReset()
  calls.detail.mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals() })
function mount() { render(<QueryClientProvider client={client}><ForeConsultPage /></QueryClientProvider>) }

it.each([false, true])('keeps business fields empty for a signed-in admin name and accepts deliberate creator filtering (phone=%s)', async phone => {
  viewport.phone = phone
  mount()
  if (phone) {
    const edit = await screen.findByRole('button', { name: '编辑咨询' })
    await waitFor(() => expect(edit).toBeEnabled())
    fireEvent.click(edit)
    fireEvent.click(screen.getByText('问题标题（可选）'))
  }
  const title = await screen.findByRole('textbox', { name: '问题标题' })
  expect(title).toHaveValue('')
  expect(title).toHaveAttribute('autocomplete', 'off')
  if (!phone) expect((title as HTMLInputElement).form).toHaveAttribute('name', 'consult-question-title')
  if (phone) {
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '更多咨询功能' }))
  }
  fireEvent.click(screen.getByRole('button', { name: /历史咨询/ }))
  const filter = screen.getByRole('searchbox', { name: '按提问用户筛选' })
  expect(filter).toHaveValue('')
  expect(filter).toHaveAttribute('autocomplete', 'off')
  fireEvent.change(filter, { target: { value: 'admin' } })
  expect(filter).toHaveValue('admin')
  expect(calls.start).not.toHaveBeenCalled()
})

it('automatically connects a pending consultation when its history row has not received the runtime binding', async () => {
  viewport.phone = true
  const row = { ...pending, sessionId: 'other-pending', devSessionId: null, questionTitle: '进行中的另一咨询' }
  calls.history.mockResolvedValue([pending, row])
  calls.detail.mockResolvedValue({ ...row, devSessionId: 'recovered-runtime' })
  mount()
  await screen.findByText('原咨询对话')
  fireEvent.click(screen.getByRole('button', { name: '更多咨询功能' }))
  fireEvent.click(screen.getByRole('button', { name: /历史咨询/ }))
  fireEvent.click(await screen.findByRole('button', { name: '进行中的另一咨询' }))
  await waitFor(() => expect(calls.switchTo).toHaveBeenLastCalledWith('recovered-runtime', false))
  expect(screen.getByText('原咨询对话')).toBeVisible()
  expect(screen.queryByText('归档只读')).not.toBeInTheDocument()
  expect(screen.queryByText(/回到星图|查看对话.*可继续/)).not.toBeInTheDocument()
  expect(calls.start).not.toHaveBeenCalled()
  expect(calls.archive).not.toHaveBeenCalled()
})

it('opens archived history using the original session in read-only mode', async () => {
  viewport.phone = true
  calls.history.mockResolvedValue([pending, { ...pending, sessionId: 'archived', devSessionId: 'archived-runtime', archiveStatus: 'SUCCESS', questionTitle: '归档问题标题' }])
  mount()
  await screen.findByText('原咨询对话')
  fireEvent.click(screen.getByRole('button', { name: '更多咨询功能' }))
  fireEvent.click(screen.getByRole('button', { name: /历史咨询/ }))
  fireEvent.click(await screen.findByText('归档问题标题'))
  expect(screen.getByText('归档只读')).toBeVisible()
  expect(calls.switchTo).toHaveBeenLastCalledWith('archived-runtime', false)
  expect(screen.queryByRole('button', { name: '关闭更多功能' })).not.toBeInTheDocument()
  expect(calls.archive).not.toHaveBeenCalled()
  expect(calls.start).not.toHaveBeenCalled()
})

it('reads legacy archives without a runtime session in the full mobile workspace and returns to history', async () => {
  viewport.phone = true
  const archived = { ...pending, sessionId: 'legacy', devSessionId: null, archiveStatus: 'SUCCESS', questionTitle: '旧归档问题',
    rawReferenceJson: JSON.stringify([{ kind: 'user', text: '旧问题全文' }, { kind: 'assistant', text: '旧回答完整内容' }]) }
  calls.history.mockResolvedValue([pending, archived])
  calls.detail.mockResolvedValue(archived)
  mount()
  await screen.findByText('原咨询对话')
  fireEvent.click(screen.getByRole('button', { name: '更多咨询功能' }))
  fireEvent.click(screen.getByRole('button', { name: /历史咨询/ }))
  fireEvent.click(await screen.findByRole('button', { name: /旧归档问题/ }))
  expect(await screen.findByText('旧回答完整内容')).toBeVisible()
  expect(screen.getByText('旧问题全文')).toBeVisible()
  expect(document.querySelectorAll('#fc-consult-view')).toHaveLength(1)
  expect(document.querySelector('.fc-resizable-panel')).toBeNull()
  expect(screen.getByRole('button', { name: '新建咨询' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '返回历史咨询' }))
  expect(await screen.findByRole('button', { name: /旧归档问题/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: '补偿抽取 BUG' })).not.toBeInTheDocument()
  expect(calls.archive).not.toHaveBeenCalled()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
})

it.each([false, true])('hides administrator tools for ordinary users (phone=%s)', async phone => {
  viewport.phone = phone
  mount()
  if (phone) await screen.findByRole('button', { name: '编辑咨询' })
  else await screen.findByRole('textbox', { name: '业务问题' })
  if (phone) fireEvent.click(screen.getByRole('button', { name: '更多咨询功能' }))
  else fireEvent.click(screen.getByRole('button', { name: '更多咨询设置' }))
  expect(screen.queryByRole('button', { name: /Forge 风格|Glass 风格|数据归属|连线|Bug 登记/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /历史咨询/ })).toBeVisible()
  expect(screen.getByRole('button', { name: '查看更新记录' })).toBeVisible()
})

it('opens a separate mobile question draft without archiving and can return to the same consultation', async () => {
  viewport.phone = true
  calls.history.mockResolvedValue([pending])
  calls.start.mockReturnValue(new Promise(() => {}))
  mount()
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '新建咨询' }))
  expect(screen.getByText('原咨询对话')).not.toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '编辑咨询' }))
  fireEvent.change(screen.getByRole('textbox', { name: '咨询问题描述' }), { target: { value: '独立的新问题' } })
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑咨询' })).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '返回当前咨询' }))
  expect(screen.getByText('原咨询对话')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '新建咨询' }))
  expect(screen.getByRole('button', { name: '编辑咨询' })).toHaveTextContent('独立的新问题')
  await act(async () => { await client.invalidateQueries({ queryKey: ['fore-consult-sessions'] }) })
  expect(screen.getByRole('button', { name: '编辑咨询' })).toHaveTextContent('独立的新问题')
  expect(calls.archive).not.toHaveBeenCalled()
  expect(calls.start).not.toHaveBeenCalled()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
  fireEvent.click(screen.getByRole('button', { name: '发送咨询' }))
  await waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
  expect(calls.start.mock.calls[0][0]).toMatchObject({ autoDetect: true, systemName: '', question: '独立的新问题', moduleNames: [] })
  expect(calls.archive).not.toHaveBeenCalled()
})

it('starts from the question without selecting a system or entering a title', async () => {
  calls.start.mockReturnValue(new Promise(() => {}))
  mount()
  const question = await screen.findByRole('textbox', { name: '业务问题' })
  await waitFor(() => expect(question).toBeEnabled())
  expect(screen.queryByRole('combobox', { name: '系统定位方式' })).not.toBeInTheDocument()
  fireEvent.change(question, { target: { value: '为什么订单价格\n下限变成了65' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask Forge' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ask Forge' }))
  await waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
  expect(calls.start.mock.calls[0][0]).toMatchObject({ autoDetect: true, systemName: '', systemSourcePath: '' })
  expect(calls.start.mock.calls[0][0].questionTitle).toMatch(/^\d{6}-为什么订单价格 下限变成了65$/)
})

it('uses keyboard activation of a graph system only as a preference and preserves automatic fallback and the draft', async () => {
  calls.start.mockReturnValue(new Promise(() => {}))
  mount()
  const question = await screen.findByRole('textbox', { name: '业务问题' })
  await waitFor(() => expect(question).toBeEnabled())
  fireEvent.change(question, { target: { value: '请核查截图' } })
  fireEvent.click(screen.getByRole('button', { name: '系统图谱' }))
  const project = screen.getByRole('button', { name: 'ERP' })
  fireEvent.click(project, { detail: 0 })
  expect(screen.queryByRole('combobox', { name: '系统定位方式' })).not.toBeInTheDocument()
  expect(screen.getByText('先查 ERP，未命中自动探索关联系统')).toBeVisible()
  expect(question).toHaveValue('请核查截图')
  expect(calls.start).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask Forge' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ask Forge' }))
  await waitFor(() => expect(calls.start).toHaveBeenCalledOnce())
  expect(calls.start.mock.calls[0][0]).toMatchObject({ autoDetect: true,
    systemName: 'erp', systemSourcePath: 'D:/workspace/erp', question: '请核查截图' })
})

it('submits with Enter outside composition and shows a failed request with draft-preserving retry', async () => {
  calls.start.mockRejectedValueOnce(new Error('优先系统已不可用或不在咨询显示范围'))
  mount()
  const question = await screen.findByRole('textbox', { name: '业务问题' })
  fireEvent.change(question, { target: { value: '检查这些截图和订单日期' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask Forge' })).toBeEnabled())
  fireEvent.keyDown(question, { key: 'Enter', shiftKey: true })
  fireEvent.keyDown(question, { key: 'Enter', isComposing: true })
  expect(calls.start).not.toHaveBeenCalled()
  fireEvent.keyDown(question, { key: 'Enter' })
  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent('优先系统已不可用或不在咨询显示范围')
  expect(calls.start).toHaveBeenCalledOnce()
  expect(question).toHaveValue('检查这些截图和订单日期')
  expect(calls.start.mock.calls[0][0].question).toBe('检查这些截图和订单日期')
  calls.start.mockReturnValue(new Promise(() => {}))
  fireEvent.click(screen.getByRole('button', { name: '重试发送' }))
  await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: 'Ask Forge' })).toBeDisabled()
})

it('allows a new question after authoritative history succeeds even when runtime hints fail', async () => {
  calls.runtime.mockRejectedValue(new Error('HTTP 500'))
  mount()
  fireEvent.click(screen.getByRole('button', { name: '系统图谱' }))
  const project = await screen.findByRole('button', { name: 'ERP' })
  await waitFor(() => expect(project).toBeEnabled())
  project.setPointerCapture = vi.fn()
  fireEvent.pointerDown(project, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(project, { pointerId: 1, clientX: 100, clientY: 100 })
  expect(screen.getByRole('textbox', { name: '业务问题' })).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(calls.start).not.toHaveBeenCalled()
})

it('does not wait for an unrelated runtime listing that never settles', async () => {
  calls.runtime.mockReturnValue(new Promise(() => {}))
  mount()
  await waitFor(() => expect(screen.getByRole('textbox', { name: '业务问题' })).toBeEnabled())
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
  expect(screen.getByRole('textbox', { name: '业务问题' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /^重试$/ }))
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
  expect(calls.start).not.toHaveBeenCalled()
})

it('does not trust a cached empty history while the fresh history request is still pending', async () => {
  let resolve!: (value: ConsultSessionView[]) => void
  client.setQueryData(['fore-consult-sessions'], [])
  calls.history.mockReturnValue(new Promise<ConsultSessionView[]>(done => { resolve = done }))
  calls.own.mockResolvedValue([pending])
  mount()
  expect(await screen.findByRole('textbox', { name: '业务问题' })).toBeDisabled()
  await act(async () => resolve([pending]))
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
})

it('restores only the owned recent conversation even when administrative history contains other users', async () => {
  calls.history.mockResolvedValue([{ ...pending, sessionId: 'colleague', devSessionId: 'colleague-runtime' }, pending])
  calls.own.mockResolvedValue([pending])
  mount()
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('original-runtime', false)
  expect(screen.getByRole('button', { name: 'ERP' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '新建咨询' }))
  expect(screen.getByRole('textbox', { name: '业务问题' })).toBeVisible()
  fireEvent.change(screen.getByRole('textbox', { name: '业务问题' }), { target: { value: '今天的新问题' } })
  fireEvent.click(screen.getAllByRole('button', { name: '返回当前咨询' })[0])
  expect(screen.getByText('原咨询对话')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '新建咨询' }))
  expect(screen.getByRole('textbox', { name: '业务问题' })).toHaveValue('今天的新问题')
  expect(calls.archive).not.toHaveBeenCalled()
  expect(calls.start).not.toHaveBeenCalled()
})

it('opens the latest owned archived runtime without reviving its write permission', async () => {
  const archived = { ...pending, archiveStatus: 'SUCCESS' }
  calls.history.mockResolvedValue([archived]); calls.own.mockResolvedValue([archived])
  mount()
  expect(await screen.findByText('归档只读')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '延续新建' }))
  expect(screen.getByText('接着上次的内容，开始新咨询')).toBeVisible()
  expect(calls.start).not.toHaveBeenCalled()
  expect(calls.archive).not.toHaveBeenCalled()
})

it('restores an already-bound continuation returned by retry without opening or sending another runtime', async () => {
  calls.history.mockResolvedValue([pending]); calls.own.mockResolvedValue([pending])
  calls.continuation.mockResolvedValue({ ...pending, sessionId: 'continued', devSessionId: 'continued-runtime', questionTitle: '新咨询' })
  mount()
  await screen.findByText('原咨询对话')
  fireEvent.click(screen.getByRole('button', { name: '延续新建' }))
  fireEvent.change(screen.getByRole('textbox', { name: '业务问题' }), { target: { value: '继续检查今天的订单' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask Forge' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ask Forge' }))
  await waitFor(() => expect(calls.switchTo).toHaveBeenLastCalledWith('continued-runtime', false))
  expect(calls.continuation).toHaveBeenCalledOnce()
  expect(calls.start).not.toHaveBeenCalled()
  expect(calls.archive).not.toHaveBeenCalled()
})

it('reads a source reference without switching the active runtime and can return to the new consultation', async () => {
  const continued = { ...pending, sessionId: 'continued', devSessionId: 'continued-runtime',
    evidenceRouteSnapshot: JSON.stringify({ continuation: { sourceSessionId: 'source', sourceTitle: '旧问题', excerptTurnCount: 2 } }) }
  calls.history.mockResolvedValue([continued]); calls.own.mockResolvedValue([continued])
  calls.detail.mockResolvedValue({ ...pending, sessionId: 'source', questionTitle: '旧问题' })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: '查看旧咨询' }))
  await waitFor(() => expect(calls.detail).toHaveBeenCalledWith('source'))
  expect(calls.switchTo).toHaveBeenCalledExactlyOnceWith('continued-runtime', false)
  fireEvent.click(screen.getByRole('button', { name: '返回当前咨询' }))
  expect(screen.getByText('原咨询对话')).toBeVisible()
  expect(calls.start).not.toHaveBeenCalled()
})

it('preserves the mobile first-question draft while switching between consultation and graph', async () => {
  viewport.phone = true
  mount()
  const edit = await screen.findByRole('button', { name: '编辑咨询' })
  await waitFor(() => expect(edit).toBeEnabled())
  fireEvent.click(edit)
  fireEvent.change(await screen.findByRole('textbox', { name: '咨询问题描述' }), { target: { value: '检查手机订单日期' } })
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑咨询' })).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('tab', { name: '系统图谱' }))
  expect(screen.queryByRole('button', { name: '编辑咨询' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: /^咨询$/ }))
  expect(screen.getByRole('button', { name: '编辑咨询' })).toHaveTextContent('检查手机订单日期')
  expect(calls.start).not.toHaveBeenCalled()
})

it('focuses the mobile graph without sending and opens a system-specific new draft while retaining the original consult', async () => {
  viewport.phone = true
  calls.history.mockResolvedValue([pending])
  mount()
  expect(await screen.findByText('原咨询对话')).toBeVisible()
  fireEvent.click(screen.getByRole('tab', { name: '系统图谱' }))
  fireEvent.click(await screen.findByRole('button', { name: 'ERP' }))
  expect(screen.getByRole('region', { name: 'ERP 的关联关系' })).toBeVisible()
  expect(calls.start).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '放大图谱' }))
  const transform = screen.getByTestId('mobile-graph-world').style.transform
  fireEvent.click(screen.getByRole('button', { name: '咨询此系统' }))
  expect(screen.getByRole('button', { name: '编辑咨询' })).toBeVisible()
  expect(screen.getByText('优先探索：ERP')).toBeVisible()
  expect(screen.getByRole('button', { name: '返回当前咨询' })).toBeVisible()
  fireEvent.click(screen.getByRole('tab', { name: '系统图谱' }))
  expect(screen.getByTestId('mobile-graph-world').style.transform).toBe(transform)
  fireEvent.click(screen.getByRole('tab', { name: /^咨询$/ }))
  fireEvent.click(screen.getByRole('button', { name: '返回当前咨询' }))
  expect(screen.getByText('原咨询对话')).toBeVisible()
  expect(calls.archive).not.toHaveBeenCalled()
  expect(calls.start).not.toHaveBeenCalled()
})

it('keeps desktop settings in a single optional menu and opens a bounded workspace', async () => {
  mount()
  const question = await screen.findByRole('textbox', { name: '业务问题' })
  const workspace = question.closest('.fc-desktop-workspace')
  expect(workspace).not.toHaveAttribute('data-conversation-expanded')
  expect(document.getElementById('fc-consult-tools')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '更多咨询设置' }))
  expect(document.getElementById('fc-consult-tools')).toBeVisible()
  fireEvent.keyDown(document.getElementById('fc-consult-tools')!, { key: 'Escape' })
  expect(document.getElementById('fc-consult-tools')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '展开对话窗口' }))
  expect(workspace).toHaveAttribute('data-conversation-expanded', 'true')
  fireEvent.click(screen.getByRole('button', { name: '还原对话窗口' }))
  expect(workspace).not.toHaveAttribute('data-conversation-expanded')
  expect(question).toBeInTheDocument()
})

it('replaces the previous-day reminder instead of accumulating siblings during repeated history switches', async () => {
  const rows = [pending, ...['second', 'third'].map(id => ({ ...pending, sessionId: id,
    devSessionId: `${id}-runtime`, questionTitle: `${id}咨询` }))]
  calls.history.mockResolvedValue(rows)
  calls.own.mockResolvedValue([pending])
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    mount()
    await screen.findByText('原咨询对话')
    expect(screen.getAllByRole('complementary', { name: '跨天咨询提醒' })).toHaveLength(1)
    for (const row of [rows[1], rows[2], rows[0], rows[1], rows[2], rows[0]]) {
      fireEvent.click(screen.getByRole('button', { name: '历史咨询' }))
      fireEvent.click(await screen.findByRole('button', { name: row.questionTitle! }))
      await waitFor(() => expect(calls.switchTo).toHaveBeenLastCalledWith(row.devSessionId, false))
      expect(screen.getAllByRole('complementary', { name: '跨天咨询提醒' })).toHaveLength(1)
      expect(screen.getAllByText('原咨询对话')).toHaveLength(1)
    }
    expect(errors.mock.calls.some(args => args.some(value => String(value).includes('same key')))).toBe(false)
  } finally { errors.mockRestore() }
})
