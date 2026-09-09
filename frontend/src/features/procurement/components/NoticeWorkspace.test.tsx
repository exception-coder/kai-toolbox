import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { procurementApi } from '../api'
import { NoticeWorkspace } from './NoticeWorkspace'

vi.mock('../api', () => ({ procurementApi: { sites: vi.fn(), businessNotices: vi.fn(), start: vi.fn(), exportNotices: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('renders configured business columns and parses saved content without a capture action', async () => {
  vi.mocked(procurementApi.sites).mockResolvedValue([{ id: 'national', name: '全国平台', host: '', enabled: true, listUrl: '', notes: '' }])
  vi.mocked(procurementApi.businessNotices).mockResolvedValue({ fields: [
    { key: 'owner', label: '采购人', group: '业务', type: 'TEXT', mode: 'LLM', enabled: true, order: 1, description: '' },
  ], items: [{ notice: { id: 'notice', title: '公告', siteId: 'national', url: 'https://www.ggzy.gov.cn/a',
    capturedAt: '2026-09-06T08:00:00Z', captureStatus: 'SUCCESS', parseStatus: 'CANDIDATES_ONLY',
    rawText: '', finalUrl: '', frameUrl: '', httpStatus: 200, error: '', candidates: '{}', analysis: '{}', sourceData: '{}', runId: null, updateTime: '' },
    values: { owner: '测试采购单位' } }], total: 1, page: 0, pageSize: 30 })
  vi.mocked(procurementApi.start).mockRejectedValue(new Error('测试失败恢复'))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NoticeWorkspace busy={false} useLlm={false} /></QueryClientProvider>)
  expect(await screen.findByRole('columnheader', { name: '采购人' })).toBeInTheDocument()
  expect(screen.getByText('测试采购单位')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '缓存页面' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '解析缓存' }))
  await waitFor(() => expect(procurementApi.start).toHaveBeenCalledWith('', 'notice', true, true))
  fireEvent.change(screen.getByRole('combobox', { name: '筛选站点' }), { target: { value: 'national' } })
  await waitFor(() => expect(procurementApi.businessNotices).toHaveBeenCalledWith('', 'national', '', 0))
  vi.mocked(procurementApi.exportNotices).mockRejectedValue(new Error('导出失败，请重试'))
  await waitFor(() => expect(screen.getByRole('button', { name: '导出 Excel' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }))
  await waitFor(() => expect(procurementApi.exportNotices).toHaveBeenCalledWith('', 'national', ''))
  expect(await screen.findByText('导出失败，请重试')).toBeInTheDocument()
})
