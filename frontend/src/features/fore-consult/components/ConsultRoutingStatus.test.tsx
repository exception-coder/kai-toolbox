import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultRoutingStatus } from './ConsultRoutingStatus'
import { correctConsultSourceRouting, getConsultSourceRouting, type ConsultSourceRouting } from '../api'

vi.mock('../api', () => ({ getConsultSourceRouting: vi.fn(), correctConsultSourceRouting: vi.fn() }))
const scope: ConsultSourceRouting = { automatic: true, focusedProject: null,
  projects: [{ id: 'web', name: 'web', label: 'ERP 小程序', path: '/web' },
    { id: 'erp', name: 'erp', label: 'ERP 服务端', path: '/erp' }],
  evidencePath: null, reason: null, selectedBy: null }
let client: QueryClient
afterEach(() => { cleanup(); client?.clear(); vi.resetAllMocks() })
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><textarea aria-label="草稿" defaultValue="下一条问题" />
    <ConsultRoutingStatus consultId="consult" /></QueryClientProvider>)
}

it('shows automatic candidates and corrects the server in place while preserving the draft', async () => {
  vi.mocked(getConsultSourceRouting).mockResolvedValue(scope)
  vi.mocked(correctConsultSourceRouting).mockResolvedValue({ ...scope, automatic: false, focusedProject: 'erp', selectedBy: 'USER' })
  mount()
  expect(await screen.findByText('自动识别中，先核查最匹配的系统')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '纠正系统' }))
  fireEvent.change(screen.getByRole('combobox', { name: '指定对应服务端' }), { target: { value: 'erp' } })
  expect(await screen.findByText('服务端焦点：ERP 服务端')).toBeVisible()
  expect(screen.getByText('用户指定')).toBeVisible()
  expect(screen.getByRole('textbox', { name: '草稿' })).toHaveValue('下一条问题')
  expect(correctConsultSourceRouting).toHaveBeenCalledWith('consult', 'erp')
})

it('keeps the correction recoverable after a failure and allows selecting the same candidate again', async () => {
  vi.mocked(getConsultSourceRouting).mockResolvedValue(scope)
  vi.mocked(correctConsultSourceRouting).mockRejectedValueOnce(new Error('暂时不可用'))
    .mockResolvedValue({ ...scope, focusedProject: 'erp', selectedBy: 'USER' })
  mount()
  await screen.findByText('自动识别中，先核查最匹配的系统')
  fireEvent.click(screen.getByRole('button', { name: '纠正系统' }))
  const select = screen.getByRole('combobox', { name: '指定对应服务端' })
  fireEvent.change(select, { target: { value: 'erp' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('纠正未保存')
  await waitFor(() => expect(select).toBeEnabled())
  expect(select).toHaveValue('')
  fireEvent.change(select, { target: { value: 'erp' } })
  expect(await screen.findByText('服务端焦点：ERP 服务端')).toBeVisible()
})
