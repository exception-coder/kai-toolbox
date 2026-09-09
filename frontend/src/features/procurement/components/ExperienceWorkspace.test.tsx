import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { procurementApi } from '../api'
import { ExperienceWorkspace } from './ExperienceWorkspace'

vi.mock('../api', () => ({ procurementApi: { experiences: vi.fn(), exampleRuns: vi.fn(), regressExamples: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('shows positive and negative examples, filters and records a manually triggered regression', async () => {
  vi.mocked(procurementApi.experiences).mockResolvedValue({ version: 'v1', rules: [{ id: 'amount', name: '明确金额单位', description: '单位须有依据', source: '样例', coverage: '可执行样例', implementation: '生产校验', examples: [
    { id: 'yes', kind: '正例', text: '105万元', explanation: '接受明确单位' }, { id: 'no', kind: '反例', text: '105', explanation: '拒绝裸数字' },
  ] }] })
  vi.mocked(procurementApi.exampleRuns).mockResolvedValue([])
  vi.mocked(procurementApi.regressExamples).mockResolvedValue({ id: 'run', createdAt: '', catalogVersion: 'v1', ruleVersion: 'v2', schemaVersion: 5, passed: 2, total: 2, outcomes: [] })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ExperienceWorkspace /></QueryClientProvider>)
  expect(await screen.findByText('接受明确单位')).toBeInTheDocument()
  expect(screen.getByText('拒绝裸数字')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: '搜索解析经验' }), { target: { value: '不存在' } })
  expect(screen.queryByText('明确金额单位')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
  fireEvent.click(screen.getByRole('button', { name: '运行样例回归' }))
  await waitFor(() => expect(procurementApi.regressExamples).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(procurementApi.exampleRuns).toHaveBeenCalledTimes(2))
})
