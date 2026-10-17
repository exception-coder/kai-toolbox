import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileAgentDock } from './MobileAgentDock'
import type { ChatItem, ClaudeChatSessionView } from '../types'

const availability = vi.hoisted(() => vi.fn<() => string | null>(() => null))
vi.mock('../lib/nativeVoice', () => ({ voiceAvailability: availability }))
afterEach(() => { cleanup(); availability.mockReset(); availability.mockReturnValue(null); vi.unstubAllGlobals() })

function fixture(onStartVoice = vi.fn(), items: ChatItem[] = [], running = false, backendRunning = false, workspace = false) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
  client.setQueryData(['claude-chat-runtime-state', 'session'], { effectiveStatus: backendRunning ? 'RUNNING' : 'IDLE', consistency: 'CONSISTENT', recommendedAction: '可以发送消息' })
  render(<QueryClientProvider client={client}><MobileAgentDock
    status={{ workspace, sessionId: 'session', items, running, engineLabel: 'Codex', turnTokens: 61, connState: 'ready', backgroundTasks: [], usage: null, usageLoading: false, onOpenUsage: vi.fn(), onOpenTrajectory: vi.fn() }}
    queue={{ items: [], onSendNow: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }}
    voiceEnabled voiceDisabled={false} onStartVoice={onStartVoice}
    diagnostics={<p>全链路诊断</p>} storage={<p>记录暂无法获取，请刷新重试</p>}
  /></QueryClientProvider>)
  return onStartVoice
}

it('desktop workspace discloses diagnostics and record recovery on demand and restores focus', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  fixture(vi.fn(), [{ kind: 'activity', id: 'current', activityType: 'command', title: '检查文件', status: 'running', data: { elapsedMs: 68000 } }], true, true, true)
  const trigger = screen.getByRole('button', { name: /查看运行详情/ })
  expect(trigger).toHaveTextContent('68.0s')
  expect(screen.queryByText('全链路诊断')).not.toBeInTheDocument()
  expect(screen.queryByText(/记录暂无法获取/)).not.toBeInTheDocument()
  fireEvent.click(trigger)
  expect(screen.getByText('全链路诊断')).toBeInTheDocument()
  expect(screen.getByText(/记录暂无法获取/)).toBeInTheDocument()
  const queue = screen.getByRole('region', { name: '待发送队列' })
  expect(within(queue).getByText('暂无待发送消息')).toBeVisible()
  expect(queue.compareDocumentPosition(screen.getByRole('region', { name: '状态与诊断' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  await vi.waitFor(() => expect(trigger).toHaveFocus())
})

it('opens controls without starting voice; explicit start closes the dock and starts once', () => {
  const start = fixture()
  fireEvent.click(screen.getByRole('button', { name: /查看运行详情/ }))
  expect(start).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  expect(start).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('explains unavailable voice and preserves text workflow', () => {
  availability.mockReturnValue('浏览器不支持语音')
  const start = fixture()
  fireEvent.click(screen.getByRole('button', { name: /查看运行详情/ }))
  expect(screen.getByRole('button', { name: '语音对话' })).toBeDisabled()
  expect(screen.getByText(/仍可继续文字对话/)).toBeInTheDocument()
  expect(start).not.toHaveBeenCalled()
})

it('keeps current activity and queue as one summary, with complete events and metrics only in details', () => {
  fixture(vi.fn(), [
    { kind: 'result', id: 'old', stopReason: 'end_turn', usage: { output_tokens: 5000 } },
    { kind: 'activity', id: 'tools', activityType: 'tool', title: '正在执行工具', status: 'running' },
    { kind: 'activity', id: 'files', activityType: 'diff', title: '本轮文件变更', status: 'running', data: { paths: ['src/example.ts'] } },
    { kind: 'activity', id: 'command', activityType: 'command', title: 'cua_repl/js 执行中', status: 'running', data: { elapsedMs: 371400 } },
  ], true)
  const summary = screen.getByRole('button', { name: /查看运行详情/ })
  expect(summary).toHaveTextContent('cua_repl/js')
  expect(summary).not.toHaveTextContent('Token')
  expect(screen.queryByText('本轮文件变更')).not.toBeInTheDocument()
  fireEvent.click(summary)
  const detail = within(screen.getByRole('region', { name: '执行详情' }))
  expect(detail.getByText('正在执行工具')).toBeInTheDocument()
  expect(detail.getByText('本轮文件变更')).toBeInTheDocument()
  expect(detail.getByText('当前轮输出 61 Token')).toBeInTheDocument()
  expect(detail.getByText('当前活动耗时 371.4s')).toBeInTheDocument()
  expect(detail.queryByText('5000')).not.toBeInTheDocument()
})

it('uses the same runtime truth for the summary and details when the browser has not observed the running turn', () => {
  fixture(vi.fn(), [{ kind: 'result', id: 'old', stopReason: 'end_turn', usage: { output_tokens: 5000 } }], false, true)
  fireEvent.click(screen.getByRole('button', { name: /Codex 正在运行.*查看运行详情/ }))
  const detail = within(screen.getByRole('region', { name: '执行详情' }))
  expect(detail.getByText('执行详情 · 当前执行')).toBeInTheDocument()
  expect(detail.queryByText(/最近一轮|当前轮输出/)).not.toBeInTheDocument()
})

it('pins the actionable queue ahead of long session lists and monitoring without sending on open', () => {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, staleTime: Infinity } } })
  client.setQueryData(['claude-chat-runtime-state', 'session'], { effectiveStatus: 'IDLE', consistency: 'CONSISTENT', recommendedAction: '可以发送消息' })
  const sessions = Array.from({ length: 12 }, (_, index): ClaudeChatSessionView => ({
    id: `recent-${index}`, title: `最近会话 ${index}`, cwd: 'D:/workspace', sdkSessionId: null,
    status: 'IDLE', startedAt: index, lastSeenAt: index, live: false,
  }))
  client.setQueryData(['claude-chat-sessions'], sessions)
  const onSendNow = vi.fn(), onRemove = vi.fn(), onClear = vi.fn()
  render(<QueryClientProvider client={client}><MobileAgentDock
    status={{ workspace: true, sessionId: 'session', items: [], running: false, engineLabel: 'Codex', turnTokens: 0,
      connState: 'ready', backgroundTasks: [], usage: null, usageLoading: false,
      onOpenUsage: vi.fn(), onOpenTrajectory: vi.fn(), onSwitchSession: vi.fn() }}
    queue={{ items: [{ id: 'q-1', ownerSessionId: 'session', text: '核对收货单', createdAt: 1 }, { id: 'q-2', ownerSessionId: 'session', text: '再生成 Excel', createdAt: 2 }],
      pausedReason: '上一轮中断，队列已暂停', canSendNow: true, onSendNow, onRemove, onClear }}
    voiceEnabled={false} voiceDisabled={false} onStartVoice={vi.fn()} diagnostics={<p>监控指标</p>} />
  </QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: /查看运行详情/ }))
  const queue = screen.getByRole('region', { name: '待发送队列' })
  const scrollable = screen.getByRole('region', { name: '会话操作与运行详情' })
  expect(scrollable).not.toContainElement(queue)
  expect(queue.compareDocumentPosition(scrollable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(queue).getByText('核对收货单')).toBeInTheDocument()
  expect(within(queue).getByText('上一轮中断，队列已暂停')).toBeInTheDocument()
  const switcher = screen.getByRole('region', { name: '快速切换会话' })
  const overview = screen.getByRole('region', { name: '运行概览' })
  expect(switcher.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(onSendNow).not.toHaveBeenCalled()
  expect(onRemove).not.toHaveBeenCalled()
  expect(onClear).not.toHaveBeenCalled()
  fireEvent.click(within(queue).getAllByRole('button', { name: '移除' })[1])
  expect(onRemove).toHaveBeenCalledExactlyOnceWith('q-2')
  fireEvent.click(within(queue).getByRole('button', { name: '发送' }))
  expect(onSendNow).toHaveBeenCalledExactlyOnceWith('q-1')
  fireEvent.click(within(queue).getByRole('button', { name: '全部清除' }))
  expect(onClear).toHaveBeenCalledOnce()
})
