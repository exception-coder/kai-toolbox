import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { http } from '@/lib/api'
import { ConsultSourceSync } from './ConsultSourceSync'

vi.mock('@/lib/api', () => ({ http: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('checks saved candidates in order, preserves partial results and permits a fresh retry', async () => {
  const callback = vi.fn()
  vi.mocked(http).mockResolvedValueOnce([{ id: 'erp', label: 'ERP', path: '/erp' }, { id: 'web', label: '小程序', path: '/web' }])
    .mockResolvedValueOnce({ status: 'UP_TO_DATE', message: '已核对上游', branch: 'main', headAtCheck: 'a'.repeat(40), checkedAt: 1 })
    .mockRejectedValueOnce(new Error('network'))
  render(<ConsultSourceSync onBusyChange={callback} />)
  fireEvent.click(screen.getByRole('button', { name: '一键 Pull 相关项目' }))
  await screen.findByText('结果未知')
  expect(screen.getByText('检查时已是最新')).toBeInTheDocument()
  expect(vi.mocked(http).mock.calls.map(call => call[0])).toEqual([
    '/fore-consult/source-sync', '/fore-consult/source-sync/erp', '/fore-consult/source-sync/web',
  ])
  expect(callback.mock.calls).toEqual([[true], [false]])
  vi.mocked(http).mockResolvedValueOnce([])
  fireEvent.click(screen.getByRole('button', { name: '一键 Pull 相关项目' }))
  await screen.findByText(/没有可同步的已保存候选/)
  expect(screen.queryByText('ERP')).not.toBeInTheDocument()
})

it('prevents duplicate submissions while awaiting the result and recovers from scope failure', async () => {
  let reject!: (error: Error) => void
  vi.mocked(http).mockReturnValueOnce(new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
  render(<ConsultSourceSync onBusyChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('button')).toBeDisabled()
  fireEvent.click(screen.getByRole('button'))
  expect(http).toHaveBeenCalledTimes(1)
  reject(new Error('scope unavailable'))
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
  expect(screen.getByRole('alert')).toHaveTextContent('无法读取同步范围')
})

it('does not start a check while candidate configuration is being saved', () => {
  render(<ConsultSourceSync onBusyChange={vi.fn()} disabled />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('button')).toBeDisabled()
  expect(http).not.toHaveBeenCalled()
})
