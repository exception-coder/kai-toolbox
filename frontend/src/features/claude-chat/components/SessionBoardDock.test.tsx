import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { listAutopilotRuns } from '../api'
import type { AutopilotDashboard, AutopilotDashboardItem, AutopilotState, SessionAutopilotRun } from '../types'
import { SessionBoardDock } from './SessionBoardDock'

const controls = vi.hoisted(() => ({
  user: { userId: 1, roles: ['ADMIN'] }, demo: false, permissionCodes: [] as string[],
  chat: { sessionId: 'current', switchTo: vi.fn() } as { sessionId: string; switchTo: ReturnType<typeof vi.fn> } | null,
  setFloating: vi.fn(), activate: vi.fn(), navigate: vi.fn(),
  location: { pathname: '/tools/claude-chat', search: '?sessionId=current&view=supervision' },
}))
vi.mock('@/lib/auth', () => ({ useAuth: () => controls }))
vi.mock('@/shell/permission', () => ({ useAccessContext: () => ({ roles: controls.user.roles, permissionCodes: controls.permissionCodes, superAdmin: false }) }))
vi.mock('../runtime/ChatRuntimeContext', () => ({ CHAT_ROUTE: '/tools/claude-chat', useChatRuntime: () => controls }))
vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => controls.navigate, useLocation: () => controls.location }))
vi.mock('../api', () => ({ listAutopilotRuns: vi.fn() }))
const read = vi.mocked(listAutopilotRuns)
const clients: QueryClient[] = []
const item = (id: string, state: AutopilotState, extra: Partial<SessionAutopilotRun> = {}): AutopilotDashboardItem => ({
  run: { id, sessionId: `session-${id}`, goal: `规划 ${id}`, state, completionPolicy: 'OPEN_SPEC_STRICT', changeId: `change-${id}`,
    progress: { completedTasks: 1, totalTasks: 3 }, ...extra } as SessionAutopilotRun,
  sessionTitle: `会话 ${id}`, projectName: 'kai-toolbox', engine: 'codex', sessionStatus: 'IDLE', lastActivityAt: 1,
})
const snapshot = (items: AutopilotDashboardItem[]): AutopilotDashboard => ({ items, counts: { active: 1, attention: 1, paused: 0, recent: 1 }, snapshotAt: new Date().toISOString() })
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const content = () => <QueryClientProvider client={client}><textarea aria-label="原会话草稿" defaultValue="保留截图和需求草稿" /><SessionBoardDock /></QueryClientProvider>
  return { client, content, ...render(content()) }
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: '打开会话快捷看板' }))
  return screen.findByRole('dialog', { name: '会话工作台' })
}
beforeEach(() => {
  localStorage.clear()
  controls.user = { userId: 1, roles: ['ADMIN'] }; controls.permissionCodes = []; controls.demo = false
  controls.chat = { sessionId: 'current', switchTo: vi.fn() }
  controls.location = { pathname: '/tools/claude-chat', search: '?sessionId=current&view=supervision' }
  read.mockResolvedValue(snapshot([item('running', 'ACTIVE'), item('done', 'COMPLETED'), item('error', 'FAILED', { reason: '验收未通过' }),
    item('waiting', 'WAITING_USER'), item('paused', 'PAUSED'), item('stopped', 'STOPPED'),
    item('self', 'COMPLETED', { completionPolicy: 'REQUIREMENT_BEST_EFFORT' })]))
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks(); vi.unstubAllGlobals() })

it('shares a real badge snapshot and switches once to the original plan without sending or losing the draft', async () => {
  mount()
  expect(await screen.findByLabelText('最近规划待处理 2 项')).toBeVisible()
  const dialog = await open()
  await within(dialog).findByRole('button', { name: '进入原会话：规划 running' })
  expect(read).toHaveBeenCalledWith({ scope: 'all', limit: 8 }, expect.any(AbortSignal))
  for (const label of ['已暂停', '已停止', '待确认', 'Agent 自验']) expect(within(dialog).getByText(label)).toBeVisible()
  expect(controls.activate).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '异常 1' }))
  expect(within(dialog).queryByRole('button', { name: '进入原会话：规划 done' })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: '进入原会话：规划 error' }))
  expect(controls.chat?.switchTo).toHaveBeenCalledExactlyOnceWith('session-error')
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?view=autopilot_detail&changeId=change-error')
  expect(controls.setFloating).toHaveBeenCalledWith(false)
  expect(screen.getByRole('textbox', { name: '原会话草稿' })).toHaveValue('保留截图和需求草稿')
})

it('returns focus on Escape and uses the deep-link owner when the chat engine is not mounted', async () => {
  controls.chat = null
  mount()
  const trigger = screen.getByRole('button', { name: '打开会话快捷看板' })
  trigger.focus()
  await open()
  await screen.findByRole('button', { name: '进入原会话：规划 done' })
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await open()
  fireEvent.click(await screen.findByRole('button', { name: '进入原会话：规划 done' }))
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?view=autopilot_detail&sessionId=session-done&changeId=change-done')
  expect(controls.activate).not.toHaveBeenCalled()
})

it('keeps row order during status updates, then restores latest order only on explicit refresh', async () => {
  read.mockResolvedValue(snapshot([item('a', 'ACTIVE'), item('b', 'FAILED')]))
  const view = mount()
  await open()
  await screen.findByRole('button', { name: '进入原会话：规划 a' })
  view.client.setQueryData(['claude-chat-autopilot-runs', 'quick-board', 1], snapshot([item('b', 'COMPLETED'), item('a', 'ACTIVE')]))
  const labels = () => screen.getAllByRole('button', { name: /^进入原会话：/ }).map(button => button.getAttribute('aria-label'))
  await waitFor(() => expect(screen.getByRole('button', { name: '已完成 1' })).toBeVisible())
  expect(labels()).toEqual(['进入原会话：规划 a', '进入原会话：规划 b'])
  read.mockResolvedValue(snapshot([item('b', 'COMPLETED'), item('a', 'ACTIVE')]))
  fireEvent.click(screen.getByRole('button', { name: '刷新最近规划' }))
  await waitFor(() => expect(labels()).toEqual(['进入原会话：规划 b', '进入原会话：规划 a']))
})

it('keeps errors and stale snapshots explicit and retries without reporting an empty success', async () => {
  read.mockRejectedValue(new Error('offline'))
  const view = mount()
  await open()
  expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
  expect(screen.queryByRole('group', { name: '规划状态筛选' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '打开完整规划看板' })).toBeEnabled()
  read.mockResolvedValue(snapshot([item('recover', 'ACTIVE')]))
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }))
  await screen.findByRole('button', { name: '进入原会话：规划 recover' })
  view.client.setQueryData(['claude-chat-autopilot-runs', 'quick-board', 1], { ...snapshot([item('recover', 'ACTIVE')]), snapshotAt: new Date(Date.now() - 60000).toISOString() })
  expect(await screen.findByRole('alert')).toHaveTextContent('当前显示上次结果')
})

it('keeps badge reads on closing, cancels on account changes and never reuses another account snapshot', async () => {
  let finish!: (value: AutopilotDashboard) => void
  read.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = mount()
  await open()
  await waitFor(() => expect(read).toHaveBeenCalledOnce())
  const signal = read.mock.calls[0][1]!
  fireEvent.click(screen.getByRole('button', { name: '关闭会话快捷看板' }))
  expect(signal.aborted).toBe(false)
  read.mockResolvedValue(snapshot([item('new-account', 'WAITING_USER')]))
  controls.user = { userId: 2, roles: ['ADMIN'] }
  view.rerender(view.content())
  await waitFor(() => expect(signal.aborted).toBe(true))
  finish(snapshot([item('old-account', 'COMPLETED')]))
  await open()
  await screen.findByRole('button', { name: '进入原会话：规划 new-account' })
  expect(screen.queryByRole('button', { name: '进入原会话：规划 old-account' })).not.toBeInTheDocument()
})

it('hides the dock in unauthorized and demo contexts and keeps empty recovery available', async () => {
  controls.user.roles = []
  const view = mount()
  expect(screen.queryByRole('button', { name: '打开会话快捷看板' })).not.toBeInTheDocument()
  controls.user.roles = ['ADMIN']; controls.demo = true
  view.rerender(view.content())
  expect(read).not.toHaveBeenCalled()
  controls.demo = false
  read.mockResolvedValue(snapshot([]))
  view.rerender(view.content())
  await open()
  await screen.findByText(/还没有受监督的规划/)
  fireEvent.click(screen.getByRole('button', { name: '打开完整规划看板' }))
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?view=supervision')
  expect(controls.chat?.switchTo).not.toHaveBeenCalled()
})

function pointerEvents() {
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent)
}

it('applies a vertical release even when a touch gesture delivers no intermediate move', () => {
  pointerEvents()
  const view = mount()
  const button = screen.getByRole('button', { name: '打开会话快捷看板' })
  const startTop = parseFloat(button.style.top), x = parseFloat(button.style.left) + 24
  fireEvent.pointerDown(button, { pointerId: 3, clientX: x, clientY: startTop + 24, button: 0 })
  fireEvent.pointerUp(button, { pointerId: 3, clientX: x, clientY: 124 })
  expect(parseFloat(button.style.top)).toBeCloseTo(100)
  fireEvent.click(button)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  view.unmount(); mount()
  expect(parseFloat(screen.getByRole('button', { name: '打开会话快捷看板' }).style.top)).toBeCloseTo(100)
})

it('keeps vertical dragging when a child icon loses implicit pointer capture', () => {
  pointerEvents()
  mount()
  const button = screen.getByRole('button', { name: '打开会话快捷看板' })
  const startTop = parseFloat(button.style.top), x = parseFloat(button.style.left) + 24
  fireEvent.pointerDown(button, { pointerId: 4, clientX: x, clientY: startTop + 24, button: 0 })
  fireEvent.lostPointerCapture(button.querySelector('svg')!, { pointerId: 4 })
  fireEvent.pointerMove(button, { pointerId: 4, clientX: x, clientY: 164 })
  expect(parseFloat(button.style.top)).toBeCloseTo(140)
  fireEvent.pointerUp(button, { pointerId: 4, clientX: x, clientY: 184 })
  expect(parseFloat(button.style.top)).toBeCloseTo(160)
  const saved = localStorage.getItem('forge:workspace-dock:1')
  fireEvent.pointerDown(button, { pointerId: 5, clientX: x, clientY: 184, button: 0 })
  fireEvent.pointerMove(button, { pointerId: 5, clientX: x, clientY: 284 })
  fireEvent.lostPointerCapture(button, { pointerId: 5 })
  expect(parseFloat(button.style.top)).toBeCloseTo(160)
  expect(localStorage.getItem('forge:workspace-dock:1')).toBe(saved)
})

it('snaps a drag to the opposite edge, suppresses its click, remembers placement and supports keyboard movement', async () => {
  pointerEvents()
  const view = mount()
  const button = screen.getByRole('button', { name: '打开会话快捷看板' })
  expect(parseFloat(button.style.left)).toBeGreaterThan(window.innerWidth / 2)
  fireEvent.pointerDown(button, { pointerId: 1, clientX: window.innerWidth - 30, clientY: 300, button: 0 })
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 20, clientY: 220 })
  fireEvent.pointerUp(button, { pointerId: 1, clientX: 20, clientY: 220 })
  // Touch WebViews may synthesize clicks with detail=0; these must also be suppressed after a drag.
  fireEvent.click(button, { detail: 0 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(button.style.left).toBe('12px')
  expect(JSON.parse(localStorage.getItem('forge:workspace-dock:1')!).edge).toBe('left')
  view.unmount()
  mount()
  const restored = screen.getByRole('button', { name: '打开会话快捷看板' })
  expect(restored.style.left).toBe('12px')
  fireEvent.keyDown(restored, { altKey: true, key: 'ArrowRight' })
  expect(parseFloat(restored.style.left)).toBeGreaterThan(window.innerWidth / 2)
  fireEvent.pointerDown(restored, { pointerId: 2, clientX: 600, clientY: 200, button: 0 })
  fireEvent.pointerMove(restored, { pointerId: 2, clientX: 602, clientY: 201 })
  fireEvent.pointerUp(restored, { pointerId: 2, clientX: 602, clientY: 201 })
  fireEvent.click(restored, { detail: 1 })
  expect(await screen.findByRole('dialog', { name: '会话工作台' })).toBeVisible()
})

it('uses a mobile bottom sheet, dismisses only by its handle and restores the original chat state', async () => {
  pointerEvents()
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  mount()
  const button = screen.getByRole('button', { name: '打开会话快捷看板' })
  const dialog = await open()
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(button).toHaveClass('opacity-0')
  const handle = dialog.firstElementChild!
  fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100, button: 0 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 180 })
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: 180 })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(button).toHaveFocus()
  expect(screen.getByRole('textbox')).toHaveValue('保留截图和需求草稿')
  expect(controls.chat?.switchTo).not.toHaveBeenCalled()
})

it('reprojects into a keyboard viewport without overwriting the user placement and clears completed badges', async () => {
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 800, offsetLeft: 0, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  const view = mount()
  const button = screen.getByRole('button', { name: '打开会话快捷看板' })
  await screen.findByLabelText('最近规划待处理 2 项')
  viewport.height = 350
  act(() => { viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(parseFloat(button.style.top)).toBeLessThanOrEqual(190))
  expect(localStorage.getItem('forge:workspace-dock:1')).toBeNull()
  view.client.setQueryData(['claude-chat-autopilot-runs', 'quick-board', 1], snapshot([item('done', 'COMPLETED')]))
  await waitFor(() => expect(screen.queryByLabelText(/最近规划待处理/)).not.toBeInTheDocument())
  expect(screen.queryByLabelText('最近规划进行中')).not.toBeInTheDocument()
})
