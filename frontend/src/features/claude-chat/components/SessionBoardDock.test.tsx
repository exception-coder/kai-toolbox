import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  return screen.findByRole('dialog', { name: '会话看板' })
}
beforeEach(() => {
  controls.user = { userId: 1, roles: ['ADMIN'] }; controls.permissionCodes = []; controls.demo = false
  controls.chat = { sessionId: 'current', switchTo: vi.fn() }
  controls.location = { pathname: '/tools/claude-chat', search: '?sessionId=current&view=supervision' }
  read.mockResolvedValue(snapshot([item('running', 'ACTIVE'), item('done', 'COMPLETED'), item('error', 'FAILED', { reason: '验收未通过' }),
    item('waiting', 'WAITING_USER'), item('paused', 'PAUSED'), item('stopped', 'STOPPED'),
    item('self', 'COMPLETED', { completionPolicy: 'REQUIREMENT_BEST_EFFORT' })]))
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.resetAllMocks() })

it('loads only on opening, shows authoritative distinct states and switches once without sending or losing the draft', async () => {
  mount()
  expect(read).not.toHaveBeenCalled()
  const dialog = await open()
  await within(dialog).findByRole('button', { name: '进入原会话：规划 running' })
  expect(read).toHaveBeenCalledWith({ scope: 'all', limit: 8 }, expect.any(AbortSignal))
  for (const label of ['已暂停', '已停止', '待确认', 'Agent 自验']) expect(within(dialog).getByText(label)).toBeVisible()
  expect(controls.activate).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '异常 1' }))
  expect(within(dialog).queryByRole('button', { name: '进入原会话：规划 done' })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: '进入原会话：规划 error' }))
  expect(controls.chat?.switchTo).toHaveBeenCalledExactlyOnceWith('session-error')
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?view=conversation')
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
  expect(controls.navigate).toHaveBeenCalledExactlyOnceWith('/tools/claude-chat?sessionId=session-done&view=conversation')
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

it('cancels a closed panel and does not reuse another account snapshot', async () => {
  let finish!: (value: AutopilotDashboard) => void
  read.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = mount()
  await open()
  await waitFor(() => expect(read).toHaveBeenCalledOnce())
  const signal = read.mock.calls[0][1]!
  fireEvent.click(screen.getByRole('button', { name: '关闭会话快捷看板' }))
  await waitFor(() => expect(signal.aborted).toBe(true))
  controls.user = { userId: 2, roles: ['ADMIN'] }
  view.rerender(view.content())
  finish(snapshot([item('old-account', 'COMPLETED')]))
  read.mockResolvedValue(snapshot([item('new-account', 'WAITING_USER')]))
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
