import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FocusReadingHeader } from './FocusReadingHeader'
import { getSessionAutopilot } from '../api'
import type { SessionAutopilotRun } from '../types'

vi.mock('../api', () => ({ getSessionAutopilot: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
function fixture(sessionId: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const exit = vi.fn(), toggle = vi.fn()
  const view = render(<QueryClientProvider client={client}><FocusReadingHeader title="应用组织权限管理"
    sessionId={sessionId} wide={false} onToggleWidth={toggle} onExit={exit} /></QueryClientProvider>)
  return { ...view, client, exit, toggle }
}
it('uses actual binding and exposes reversible width and exit controls', async () => {
  vi.mocked(getSessionAutopilot).mockResolvedValue({ sessionId: 'a', changeId: 'implement-iam', currentTaskId: '1.3' } as SessionAutopilotRun)
  const { exit, toggle } = fixture('a')
  expect(await screen.findByText('OpenSpec · implement-iam · Task 1.3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '宽版阅读' }))
  expect(toggle).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '退出专注模式' }))
  expect(exit).toHaveBeenCalledOnce()
})
it('does not reuse the previous session binding when changing sessions', async () => {
  vi.mocked(getSessionAutopilot).mockImplementation(async id => id === 'a'
    ? { sessionId: 'a', changeId: 'implement-iam', currentTaskId: '1.3' } as SessionAutopilotRun : null)
  const { client, rerender } = fixture('a')
  await screen.findByText('OpenSpec · implement-iam · Task 1.3')
  rerender(<QueryClientProvider client={client}><FocusReadingHeader title="其他会话" sessionId="b"
    wide={false} onToggleWidth={vi.fn()} onExit={vi.fn()} /></QueryClientProvider>)
  expect(screen.queryByText(/implement-iam/)).not.toBeInTheDocument()
  await screen.findByText('未绑定 OpenSpec')
})
it('reports unavailable context without inferring a task or hiding exit', async () => {
  vi.mocked(getSessionAutopilot).mockRejectedValue(new Error('unavailable'))
  fixture('failed')
  await screen.findByText('规格上下文暂无法获取')
  expect(screen.getByRole('button', { name: '退出专注模式' })).toBeEnabled()
})
