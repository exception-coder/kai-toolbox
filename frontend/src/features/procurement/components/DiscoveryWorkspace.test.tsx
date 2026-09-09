import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { procurementApi } from '../api'
import { DiscoveryWorkspace } from './DiscoveryWorkspace'

vi.mock('../api', () => ({ procurementApi: { sites: vi.fn(), discovery: vi.fn(), discoveryBatch: vi.fn(), discoveryLinks: vi.fn(), discoveryDetails: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const batch = { id: 'daily-batch', date: '2026-09-06', status: 'COMPLETED', pages: 19, error: '', matched: 42, unknown: 57,
  create_time: '2026-09-06T08:00:00Z', update_time: '2026-09-06T08:00:00Z', scopes: [] }
function mount(status = 'COMPLETED') {
  vi.mocked(procurementApi.sites).mockResolvedValue([
    { id: 'www.ggzy.gov.cn', name: '全国公共资源交易平台', enabled: true, host: 'www.ggzy.gov.cn', listUrl: '', notes: '' },
    { id: 'hebei', name: '河北平台', enabled: true, host: 'hebei', listUrl: '', notes: '' },
  ])
  vi.mocked(procurementApi.discovery).mockResolvedValue([{ ...batch, status }])
  vi.mocked(procurementApi.discoveryBatch).mockResolvedValue({ ...batch, status })
  vi.mocked(procurementApi.discoveryLinks).mockResolvedValue({ items: [], total: 0, page: 0, pageSize: 50 })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<MemoryRouter><QueryClientProvider client={client}><DiscoveryWorkspace busy={false} /></QueryClientProvider></MemoryRouter>)
}
it('starts details and parsing as separate operations scoped to the selected batch', async () => {
  vi.mocked(procurementApi.discoveryDetails).mockRejectedValue(new Error('测试恢复提示'))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: '2. 采集本批详情' }))
  await waitFor(() => expect(procurementApi.discoveryDetails).toHaveBeenCalledWith('daily-batch', false))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '3. 解析本批正文' }))
  await waitFor(() => expect(procurementApi.discoveryDetails).toHaveBeenCalledWith('daily-batch', true))
  fireEvent.click(screen.getByRole('button', { name: '地区待确认' }))
  await waitFor(() => expect(procurementApi.discoveryLinks).toHaveBeenCalledWith('daily-batch', 'REGION_UNKNOWN', 0))
})
it('prevents downstream execution while list discovery is running', async () => {
  mount('RUNNING')
  expect(await screen.findByRole('button', { name: '2. 采集本批详情' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '3. 解析本批正文' })).toBeDisabled()
})
it('does not display national batches under another collection site', async () => {
  mount()
  await screen.findByRole('button', { name: '2. 采集本批详情' })
  await screen.findByRole('option', { name: '河北平台 · 当日采集待适配' })
  fireEvent.change(screen.getByRole('combobox', { name: '采集平台（采集站点）' }), { target: { value: 'hebei' } })
  expect(screen.queryByRole('button', { name: '2. 采集本批详情' })).not.toBeInTheDocument()
  expect(screen.getByText(/尚未适配当日查询与完整翻页/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: '采集平台（采集站点）' }), { target: { value: 'www.ggzy.gov.cn' } })
  expect(await screen.findByRole('button', { name: '2. 采集本批详情' })).toBeEnabled()
})
