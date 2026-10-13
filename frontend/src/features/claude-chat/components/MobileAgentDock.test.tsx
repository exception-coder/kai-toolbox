import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileAgentDock } from './MobileAgentDock'
import type { ChatItem } from '../types'

const availability = vi.hoisted(() => vi.fn<() => string | null>(() => null))
vi.mock('../lib/nativeVoice', () => ({ voiceAvailability: availability }))
afterEach(() => { cleanup(); availability.mockReset(); availability.mockReturnValue(null) })

function fixture(onStartVoice = vi.fn(), items: ChatItem[] = [], running = false, backendRunning = false) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
  client.setQueryData(['claude-chat-runtime-state', 'session'], { effectiveStatus: backendRunning ? 'RUNNING' : 'IDLE', consistency: 'CONSISTENT', recommendedAction: '可以发送消息' })
  render(<QueryClientProvider client={client}><MobileAgentDock
    status={{ sessionId: 'session', items, running, engineLabel: 'Codex', turnTokens: 61, connState: 'ready', backgroundTasks: [], usage: null, usageLoading: false, onOpenUsage: vi.fn(), onOpenTrajectory: vi.fn() }}
    queue={{ items: [], onSendNow: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }}
    voiceEnabled voiceDisabled={false} onStartVoice={onStartVoice}
  /></QueryClientProvider>)
  return onStartVoice
}

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
