import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { procurementApi } from '../api'
import { NoticeDetail } from './NoticeDetail'

vi.mock('../api', () => ({ procurementApi: { notice: vi.fn(), rules: vi.fn(), structure: vi.fn() } }))
vi.mock('./StructuredNotice', () => ({ StructuredNotice: () => <p>业务字段</p> }))
afterEach(cleanup)
it('keeps retry diagnostics separate from business fields and links attempt history', async () => {
  vi.mocked(procurementApi.notice).mockResolvedValue({ id: 'n', title: '公告', siteId: 'national', url: 'https://www.ggzy.gov.cn/a',
    captureStatus: 'SUCCESS', parseStatus: 'PARTIAL', capturedAt: '2026-09-06T08:00:00Z', rawText: '正文',
    finalUrl: '', frameUrl: '', httpStatus: 200, error: '金额校验失败', candidates: '{}', sourceData: '{}', runId: null, updateTime: '',
    analysis: JSON.stringify({ facts: [], diagnostics: { execution: 'SUCCEEDED', fields: [{ field: 'procurement_amount', status: 'INVALID', reason: '无明确单位' }] } }) })
  vi.mocked(procurementApi.rules).mockResolvedValue([])
  vi.mocked(procurementApi.structure).mockResolvedValue({ version: 1, fields: [] })
  render(<QueryClientProvider client={new QueryClient()}><NoticeDetail id="n" close={() => {}} /></QueryClientProvider>)
  fireEvent.click(await screen.findByRole('button', { name: '解析诊断' }))
  expect(screen.getByText('无明确单位')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '查看最近 50 次解析记录（JSON）' })).toHaveAttribute('href', '/api/procurement/notices/n/attempts')
})
