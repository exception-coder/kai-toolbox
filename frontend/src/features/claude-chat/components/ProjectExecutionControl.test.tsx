import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { http } from '@/lib/api'
import { ProjectExecutionControl } from './ProjectExecutionControl'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><ProjectExecutionControl sessionId="owner" /></QueryClientProvider>)
}

it('uses the displayed project and revision and only changes state after a confirmed response', async () => {
  const before = { project: 'D:\\repo', enabled: true, revision: 0 }
  const after = { ...before, enabled: false, revision: 1 }
  vi.mocked(http).mockResolvedValueOnce(before).mockResolvedValueOnce(after).mockResolvedValue(after)
  mount()
  const toggle = await screen.findByRole('switch')
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  expect(http).toHaveBeenCalledWith('/claude-chat/sessions/owner/execution-control', expect.objectContaining({
    method: 'PUT', body: expect.stringContaining('"expectedRevision":0'),
  }))
  expect(screen.getByText(/同项目所有会话共用/)).toBeInTheDocument()
})

it('keeps a recoverable error and refresh action when the save outcome is unknown', async () => {
  const before = { project: '/repo', enabled: true, revision: 0 }
  vi.mocked(http).mockResolvedValueOnce(before).mockRejectedValueOnce(new Error('network')).mockResolvedValue(before)
  mount()
  const toggle = await screen.findByRole('switch')
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)
  expect(await screen.findByRole('alert')).toHaveTextContent('保存结果待核对')
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('button', { name: '刷新状态' })).toBeInTheDocument()
})
