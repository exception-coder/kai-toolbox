import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { procurementApi } from '../api'
import type { StructureField, StructuredResult } from '../structureTypes'
import { StructureWorkspace } from './StructureWorkspace'
import { StructuredNotice } from './StructuredNotice'

vi.mock('../api', () => ({ procurementApi: { structure: vi.fn(), saveStructure: vi.fn(), structured: vi.fn(), correct: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const field: StructureField = { key: 'city', label: '城市', group: '公告信息', type: 'TEXT', mode: 'LLM', description: '建设地点', enabled: true, order: 4 }
const result: StructuredResult = { schemaVersion: 2, analysisVersion: 1, version: 3, overrides: { city: '人工城市' },
  values: [{ field, value: '人工城市', source: 'MANUAL', evidence: [{ value: '焦作市', raw: '焦作市', evidence: '建设地点焦作市', section: '建设地点' }], alternatives: ['焦作市'], overridden: true }] }
function mount(content: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}>{content}</QueryClientProvider>)
}

it('saves configured field meaning with its structure version and immutable key', async () => {
  vi.mocked(procurementApi.structure).mockResolvedValue({ version: 2, fields: [field] })
  vi.mocked(procurementApi.saveStructure).mockRejectedValue(new Error('数据结构已被修改，请刷新'))
  mount(<StructureWorkspace />)
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
  expect(screen.getByLabelText('字段键')).toBeDisabled()
  expect(screen.getByLabelText('字段类型')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('提取说明'), { target: { value: '只取建设地点，不读代理地址' } })
  fireEvent.click(screen.getByRole('button', { name: '保存字段' }))
  await waitFor(() => expect(procurementApi.saveStructure).toHaveBeenCalledWith({ version: 2,
    fields: [{ ...field, description: '只取建设地点，不读代理地址' }] }))
  expect(await screen.findByRole('alert')).toHaveTextContent('已被修改')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('saves a deliberate blank as a manual override with record and structure versions', async () => {
  vi.mocked(procurementApi.structured).mockResolvedValue(result)
  vi.mocked(procurementApi.correct).mockResolvedValue({ ...result, version: 4, overrides: { city: '' } })
  mount(<StructuredNotice id="notice-1" />)
  fireEvent.click(await screen.findByRole('button', { name: '修正数据' }))
  fireEvent.change(screen.getByLabelText('城市'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修正' }))
  await waitFor(() => expect(procurementApi.correct).toHaveBeenCalledWith('notice-1', { schemaVersion: 2, version: 3, values: { city: '' } }))
})

it('restores the automatic value by removing the override instead of saving copied model output', async () => {
  vi.mocked(procurementApi.structured).mockResolvedValue(result)
  vi.mocked(procurementApi.correct).mockResolvedValue({ ...result, version: 4, overrides: {} })
  mount(<StructuredNotice id="notice-1" />)
  fireEvent.click(await screen.findByRole('button', { name: '修正数据' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复自动值' }))
  expect(screen.getByLabelText('城市')).toHaveValue('焦作市')
  fireEvent.click(screen.getByRole('button', { name: '保存修正' }))
  await waitFor(() => expect(procurementApi.correct).toHaveBeenCalledWith('notice-1', { schemaVersion: 2, version: 3, values: {} }))
})

it('retains failed corrections and offers recovery', async () => {
  vi.mocked(procurementApi.structured).mockResolvedValue(result)
  vi.mocked(procurementApi.correct).mockRejectedValue(new Error('公告修正已被修改，请刷新'))
  mount(<StructuredNotice id="notice-1" />)
  fireEvent.click(await screen.findByRole('button', { name: '修正数据' }))
  fireEvent.change(screen.getByLabelText('城市'), { target: { value: '保留草稿' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修正' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('重新打开公告详情')
  expect(screen.getByLabelText('城市')).toHaveValue('保留草稿')
})
