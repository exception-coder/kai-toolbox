import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { http } from '@/lib/api'
import { ProjectExecutionControl } from './ProjectExecutionControl'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('saves cadence for the current project without enabling gates', async () => {
  const before = { project: '/repo', enabled: false, revision: 4, verificationCadence: 'CHECKPOINT' }
  const after = { ...before, revision: 5, verificationCadence: 'PER_TASK' }
  vi.mocked(http).mockResolvedValueOnce(before).mockResolvedValueOnce(after).mockResolvedValue(after)
  mount()
  const select = screen.getByRole('combobox', { name: '验证节奏' })
  await waitFor(() => expect(select).toBeEnabled())
  fireEvent.change(select, { target: { value: 'PER_TASK' } })
  await waitFor(() => expect(select).toHaveValue('PER_TASK'))
  const request = vi.mocked(http).mock.calls.find(([, options]) => options?.method === 'PUT')
  expect(JSON.parse(request?.[1]?.body as string)).toMatchObject({ project: '/repo', expectedRevision: 4, enabled: false, verificationCadence: 'PER_TASK' })
})

it('disables cadence against older services instead of pretending to save it', async () => {
  vi.mocked(http).mockResolvedValue({ project: '/repo', enabled: true, revision: 0 })
  mount()
  expect(await screen.findByText('当前服务尚未支持验证节奏设置。')).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '验证节奏' })).toBeDisabled()
})

it('retains the actual cadence and a recovery action after a failed save', async () => {
  const before = { project: '/repo', enabled: true, revision: 4, verificationCadence: 'CHECKPOINT' }
  vi.mocked(http).mockResolvedValueOnce(before).mockRejectedValueOnce(new Error('conflict')).mockResolvedValue(before)
  mount()
  const select = screen.getByRole('combobox', { name: '验证节奏' })
  await waitFor(() => expect(select).toBeEnabled())
  fireEvent.change(select, { target: { value: 'PER_TASK' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('保存结果待核对')
  await waitFor(() => expect(select).toHaveValue('CHECKPOINT'))
  expect(screen.getByRole('button', { name: '刷新状态' })).toBeInTheDocument()
})

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
