import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AutopilotProgressWorkspace } from './AutopilotProgressWorkspace'

const getSessionAutopilot = vi.fn()
const listAutopilotTasks = vi.fn()
const controlSessionAutopilot = vi.fn()
vi.mock('../api', () => ({
  getSessionAutopilot: (...args: unknown[]) => getSessionAutopilot(...args),
  listAutopilotTasks: (...args: unknown[]) => listAutopilotTasks(...args),
  controlSessionAutopilot: (...args: unknown[]) => controlSessionAutopilot(...args),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><AutopilotProgressWorkspace sessionId="session-1" onOpenAll={vi.fn()} onOpenConversation={vi.fn()} /></QueryClientProvider>)
}

it('shows the bound current task and lets the user pause the same session', async () => {
  const run = {
    sessionId: 'session-1', changeId: 'upload-images', goal: '完成上传', state: 'ACTIVE', phase: 'APPLY',
    version: 7, progress: { completedTasks: 1, totalTasks: 2 }, turnCount: 2, maxTurns: 60,
    currentTaskId: '1.2', latestReport: { summary: '已完成接口', nextAction: '继续页面', remainingWork: [], evidence: [], reportedAt: '' },
  }
  getSessionAutopilot.mockResolvedValue(run)
  listAutopilotTasks.mockResolvedValue([
    { id: '1.1', applyOrdinal: 1, description: '接口', done: true },
    { id: '1.2', applyOrdinal: 2, description: '页面', done: false },
  ])
  controlSessionAutopilot.mockResolvedValue({ ...run, state: 'PAUSED', version: 8 })
  renderWorkspace()
  expect(await screen.findByText('upload-images')).toBeInTheDocument()
  expect(await screen.findByText('页面')).toBeInTheDocument()
  expect(screen.getByText('当前')).toBeInTheDocument()
  expect(screen.getByText('最近执行报告')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '暂停' }))
  await waitFor(() => expect(controlSessionAutopilot).toHaveBeenCalledWith('session-1', 'pause', 7))
})

it('shows a recovery action when this session has no supervised run', async () => {
  getSessionAutopilot.mockResolvedValue(null)
  renderWorkspace()
  expect(await screen.findByText('此会话尚未开启自动推进')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '返回对话' })).toBeInTheDocument()
})
