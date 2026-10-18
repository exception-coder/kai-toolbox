import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { SecureResourceForm } from './SecureResourceForm'
import { enrollResource, listResourceGroups } from '../api'
vi.mock('../api', () => ({ enrollResource: vi.fn(), listResourceGroups: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('previews without a network write, masks the password and retries the same confirmed enrollment', async () => {
  vi.mocked(listResourceGroups).mockResolvedValue([{ id: 'erp', name: 'ERP' }])
  vi.mocked(enrollResource).mockRejectedValueOnce(new Error('暂时断线')).mockResolvedValueOnce({ resourceId: 'record', configurationUrl: '/tools/reqpool/resources?view=connections' })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SecureResourceForm onClose={vi.fn()} /></QueryClientProvider>)
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '测试连接' } })
  fireEvent.click(screen.getByRole('combobox', { name: '已有系统分组' }))
  fireEvent.click(await screen.findByRole('option', { name: 'ERP' }))
  fireEvent.change(screen.getByLabelText('主机地址'), { target: { value: '127.0.0.1' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'never-echo-this' } })
  fireEvent.click(screen.getByRole('button', { name: '核对登记信息' }))
  expect(enrollResource).not.toHaveBeenCalled()
  expect(screen.queryByDisplayValue('never-echo-this')).not.toBeInTheDocument()
  expect(screen.getByText('已填写 · 不回显')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认保存到资源中心' }))
  await screen.findByText('暂时断线')
  fireEvent.click(screen.getByRole('button', { name: '确认保存到资源中心' }))
  await screen.findByText(/已保存到原资源中心/)
  await waitFor(() => expect(enrollResource).toHaveBeenCalledTimes(2))
  expect(vi.mocked(enrollResource).mock.calls[0][0].requestId).toBe(vi.mocked(enrollResource).mock.calls[1][0].requestId)
  expect(screen.getByRole('link', { name: '查看或修改原记录' })).toHaveAttribute('href', '/tools/reqpool/resources?view=connections')
})
