import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { ResourceIntake } from './ResourceIntake'
import { enrollResource, listResourceGroups } from '../api'
vi.mock('../api', () => ({ enrollResource: vi.fn(), listResourceGroups: vi.fn() }))
vi.mock('@/features/claude-chat/public-api/voice', () => ({ VoiceInputButton: () => <span>语音</span> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('uses one paste, masks credentials before confirmation and reuses the request after uncertainty', async () => {
  vi.mocked(listResourceGroups).mockResolvedValue([{ id: 'erp', name: 'ERP' }])
  vi.mocked(enrollResource).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ resourceId: 'saved', configurationUrl: '/tools/hosts' })
  render(<QueryClientProvider client={new QueryClient()}><ResourceIntake onClose={vi.fn()} /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('combobox', { name: '所属项目 / 系统' }))
  fireEvent.click(await screen.findByRole('option', { name: 'ERP' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '生产 SSH 10.0.0.2 user:ops password:never-echo' } })
  fireEvent.click(screen.getByRole('button', { name: '识别并登记' }))
  expect(enrollResource).not.toHaveBeenCalled()
  expect(screen.queryByDisplayValue(/never-echo/)).not.toBeInTheDocument()
  expect(screen.getByText('SSH 主机')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认登记' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '确认登记' }))
  await screen.findByText(/已登记，资源 ID/)
  expect(vi.mocked(enrollResource).mock.calls[0][0].requestId).toBe(vi.mocked(enrollResource).mock.calls[1][0].requestId)
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
})
