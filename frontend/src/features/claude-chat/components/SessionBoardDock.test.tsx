import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { listAutopilotRuns, listQueuedMessages, listSessions } from '../api'
import type { ClaudeChatSessionView } from '../types'
import { SessionBoardDock } from './SessionBoardDock'

const controls = vi.hoisted(() => ({
  user: { userId: 1, roles: ['ADMIN'] }, demo: false, permissionCodes: [] as string[],
  chat: { sessionId: 'current', switchTo: vi.fn() } as { sessionId: string; switchTo: ReturnType<typeof vi.fn> } | null,
  setFloating: vi.fn(), activate: vi.fn(), navigate: vi.fn(),
  location: { pathname: '/tools/claude-chat', search: '?sessionId=current&view=supervision' },
  assistant: null as { launch: ReturnType<typeof vi.fn>; setDelegated: ReturnType<typeof vi.fn> } | null,
}))
vi.mock('@/features/work-assistants/public-api', () => ({ useAssistantDock: () => controls.assistant }))
vi.mock('@/lib/auth', () => ({ useAuth: () => controls }))
vi.mock('@/shell/permission', () => ({ useAccessContext: () => ({ roles: controls.user.roles, permissionCodes: controls.permissionCodes, superAdmin: false }) }))
vi.mock('../runtime/ChatRuntimeContext', () => ({ CHAT_ROUTE: '/tools/claude-chat', isChatRoute: (path: string) => path.startsWith('/tools/claude-chat'), useChatRuntime: () => controls }))
vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => controls.navigate, useLocation: () => controls.location }))
vi.mock('../api', () => ({ listSessions: vi.fn(), listQueuedMessages: vi.fn(), listAutopilotRuns: vi.fn() }))
const read = vi.mocked(listSessions), queueRead = vi.mocked(listQueuedMessages)
const clients: QueryClient[] = []
const session = (id: string, fields: Partial<ClaudeChatSessionView> = {}): ClaudeChatSessionView => ({
  id, title: '会话 ' + id, cwd: 'D:/work/kai-toolbox', sdkSessionId: id, engine: 'codex',
  status: 'IDLE', live: false, startedAt: 1, lastSeenAt: Date.now(), ...fields,
})
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const content = () => <QueryClientProvider client={client}><textarea aria-label="原会话草稿" defaultValue="保留截图和需求草稿" /><SessionBoardDock /></QueryClientProvider>
  return { client, content, ...render(content()) }
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: '打开会话快捷看板' }))
  return screen.findByRole('dialog', { name: '会话看板' })
}
beforeEach(() => {
  localStorage.clear()
  controls.user = { userId: 1, roles: ['ADMIN'] }; controls.permissionCodes = []; controls.demo = false
  controls.assistant = null
  controls.chat = { sessionId: 'current', switchTo: vi.fn() }
  controls.location = { pathname: '/tools/claude-chat', search: '?sessionId=current&view=supervision' }
  read.mockResolvedValue([session('running', { status: 'RUNNING', live: true, lastSeenAt: 9 }),
    session('idle-task', { lastSeenAt: 8 }), session('interrupted', { status: 'INTERRUPTED', lastSeenAt: 7 }),
    session('ghost', { status: 'RUNNING', live: false, lastSeenAt: 6 }),
    session('done', { status: 'DONE', lastSeenAt: 5 }), session('current', { lastSeenAt: 4 })])
  queueRead.mockImplementation(async id => id === 'idle-task'
    ? [{ id: 'task-1', sessionId: id, text: '核对表单与截图', createdAt: 1 }] : [])
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks(); vi.unstubAllGlobals() })

it('consolidates the authorized assistant on mobile and releases delegation on leaving chat', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const assistant = { launch: vi.fn(), setDelegated: vi.fn() }
  controls.assistant = assistant
  const view = mount()
  expect(assistant.setDelegated).toHaveBeenCalledWith(true)
  await open()
  fireEvent.click(screen.getByRole('button', { name: '工作助理' }))
  expect(assistant.launch).toHaveBeenCalledTimes(1)
  expect(controls.chat?.switchTo).not.toHaveBeenCalled()
  expect(screen.getByLabelText('原会话草稿')).toHaveValue('保留截图和需求草稿')
  controls.location = { pathname: '/tools/project-workspace', search: '' }
  view.rerender(view.content())
  expect(assistant.setDelegated).toHaveBeenLastCalledWith(false)
})

it('shows actual session-board content and queued tasks without reading planning runs', async () => {
  mount()
  expect(await screen.findByLabelText('待关注会话 2 个')).toBeVisible()
  expect(queueRead).not.toHaveBeenCalled()
  const dialog = await open()
  await within(dialog).findByText('核对表单与截图')
  for (const label of ['空闲', '已中断', '待恢复', '已结束']) expect(within(dialog).getAllByText(label).length).toBeGreaterThan(0)
  expect(within(dialog).getByRole('button', { name: '进行中 1' })).toBeVisible()
  expect(within(dialog).getByRole('button', { name: '有待发送 1' })).toBeVisible()
  expect(within(dialog).queryByText(/OpenSpec|任务 5\/25|Agent 自验/)).not.toBeInTheDocument()
  expect(listAutopilotRuns).not.toHaveBeenCalled()
  expect(controls.activate).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '有待发送 1' }))
  fireEvent.click(within(dialog).getByRole('button', { name: '进入会话：会话 idle-task' }))
  expect(controls.chat?.switchTo).toHaveBeenCalledExactlyOnceWith('idle-task', false)
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?view=conversation')
  expect(screen.getByRole('textbox', { name: '原会话草稿' })).toHaveValue('保留截图和需求草稿')
})

it('returns focus on Escape and uses the deep-link owner without a mounted engine', async () => {
  controls.chat = null
  mount()
  const trigger = screen.getByRole('button', { name: '打开会话快捷看板' })
  trigger.focus()
  await open()
  await screen.findByRole('button', { name: '进入会话：会话 running' })
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
  await open()
  fireEvent.click(await screen.findByRole('button', { name: '进入会话：会话 running' }))
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?view=conversation&sessionId=running')
  expect(controls.activate).not.toHaveBeenCalled()
})

it('keeps queue failure explicit and refreshes the same session-board data', async () => {
  read.mockResolvedValue([session('offline')])
  queueRead.mockRejectedValue(new Error('offline'))
  mount()
  await open()
  await screen.findByText('队列暂无法获取')
  fireEvent.click(screen.getByRole('button', { name: '有待发送 0' }))
  expect(screen.getByRole('button', { name: '进入会话：会话 offline' })).toBeVisible()
  queueRead.mockResolvedValue([])
  fireEvent.click(screen.getByRole('button', { name: '刷新会话看板' }))
  await screen.findByText('最近会话中没有待发送任务')
  fireEvent.click(screen.getByRole('button', { name: '全部 1' }))
  await screen.findByText('无待发送任务')
  expect(listAutopilotRuns).not.toHaveBeenCalled()
})

it('does not carry a queue snapshot into another account and aborts its old read', async () => {
  read.mockResolvedValue([session('old-account')])
  let oldSignal: AbortSignal | undefined
  queueRead.mockImplementationOnce((_id, signal) => new Promise((_resolve, reject) => {
    oldSignal = signal
    signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }))
  const view = mount()
  await open()
  await waitFor(() => expect(oldSignal).toBeDefined())
  controls.user = { userId: 2, roles: ['ADMIN'] }
  read.mockResolvedValue([session('new-account')]); queueRead.mockResolvedValue([])
  view.rerender(view.content())
  await waitFor(() => expect(oldSignal?.aborted).toBe(true))
  await open()
  await screen.findByRole('button', { name: '进入会话：会话 new-account' })
  expect(screen.queryByRole('button', { name: '进入会话：会话 old-account' })).not.toBeInTheDocument()
})

it('hides unauthorized and demo entries and links to the complete session board', async () => {
  controls.user.roles = []
  const view = mount()
  expect(screen.queryByRole('button', { name: '打开会话快捷看板' })).not.toBeInTheDocument()
  controls.user.roles = ['ADMIN']; controls.demo = true
  view.rerender(view.content())
  expect(read).not.toHaveBeenCalled()
  controls.demo = false; read.mockResolvedValue([])
  view.rerender(view.content())
  await open()
  await screen.findByText('还没有可查看的开发会话')
  fireEvent.click(screen.getByRole('button', { name: '打开完整会话看板' }))
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?view=board')
  expect(controls.chat?.switchTo).not.toHaveBeenCalled()
})

function pointerEvents() {
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent)
}

it('avoids the keyboard viewport without changing saved placement and clears ended-session badges', async () => {
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 800, offsetLeft: 0, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  const view = mount()
  const button = screen.getByRole('button', { name: '打开会话快捷看板' })
  await screen.findByLabelText('待关注会话 2 个')
  viewport.height = 350
  act(() => { viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(parseFloat(button.style.top)).toBeLessThanOrEqual(190))
  expect(localStorage.getItem('forge:workspace-dock:1')).toBeNull()
  view.client.setQueryData(['claude-chat-sessions', 'board', 1], [session('done', { status: 'DONE' })])
  await waitFor(() => expect(screen.queryByLabelText(/待关注会话/)).not.toBeInTheDocument())
  expect(screen.queryByLabelText('最近会话进行中')).not.toBeInTheDocument()
})

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
  expect(button.style.left).toBe('0px')
  expect(JSON.parse(localStorage.getItem('forge:workspace-dock:1')!).edge).toBe('left')
  view.unmount()
  mount()
  const restored = screen.getByRole('button', { name: '打开会话快捷看板' })
  expect(restored.style.left).toBe('0px')
  fireEvent.keyDown(restored, { altKey: true, key: 'ArrowRight' })
  expect(parseFloat(restored.style.left)).toBeGreaterThan(window.innerWidth / 2)
  fireEvent.pointerDown(restored, { pointerId: 2, clientX: 600, clientY: 200, button: 0 })
  fireEvent.pointerMove(restored, { pointerId: 2, clientX: 602, clientY: 201 })
  fireEvent.pointerUp(restored, { pointerId: 2, clientX: 602, clientY: 201 })
  fireEvent.click(restored, { detail: 1 })
  expect(await screen.findByRole('dialog', { name: '会话看板' })).toBeVisible()
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
