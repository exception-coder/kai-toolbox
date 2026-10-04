import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileAgentDock } from './MobileAgentDock'

const availability = vi.hoisted(() => vi.fn<() => string | null>(() => null))
vi.mock('../lib/nativeVoice', () => ({ voiceAvailability: availability }))
afterEach(() => { cleanup(); availability.mockReset(); availability.mockReturnValue(null) })

function fixture(onStartVoice = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
  client.setQueryData(['claude-chat-runtime-state', 'session'], { effectiveStatus: 'IDLE', consistency: 'CONSISTENT', recommendedAction: '可以发送消息' })
  render(<QueryClientProvider client={client}><MobileAgentDock
    status={{ sessionId: 'session', items: [], running: false, engineLabel: 'Codex', turnTokens: 0, connState: 'ready', backgroundTasks: [], usage: null, usageLoading: false, onOpenUsage: vi.fn(), onOpenTrajectory: vi.fn() }}
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
