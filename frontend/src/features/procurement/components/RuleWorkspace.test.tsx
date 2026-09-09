import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { procurementApi } from '../api'
import { RuleWorkspace } from './RuleWorkspace'

vi.mock('../api', () => ({ procurementApi: { ruleGroups: vi.fn(), saveRuleGroup: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const rule = { id: 'GRP_NETWORK', category: 'GROUP', name: '管网工程相关性', enabled: true,
  fields: { '适用字段': 'engineering_evidence', '词组': '排水管网；污水管网', '判定规则': '仅本次采购', '边界条件': '场景词不能单独触发' } }
const group = { rule, kind: '字段解析', sources: [] }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><RuleWorkspace /></QueryClientProvider>)
}

describe('procurement rule workspace', () => {
  it('edits original workbook fields and persists contextual conditions', async () => {
    vi.mocked(procurementApi.ruleGroups).mockResolvedValue([group])
    vi.mocked(procurementApi.saveRuleGroup).mockResolvedValue(rule)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('判定规则'), { target: { value: '仅施工标段' } })
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }))
    await waitFor(() => expect(procurementApi.saveRuleGroup).toHaveBeenCalledWith({ ...rule,
      fields: { ...rule.fields, '判定规则': '仅施工标段' } }))
  })
  it('keeps failed edits open with a recovery message', async () => {
    vi.mocked(procurementApi.ruleGroups).mockResolvedValue([group])
    vi.mocked(procurementApi.saveRuleGroup).mockRejectedValue(new Error('保存失败，请重试'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
  it('offers retry on read failure', async () => {
    vi.mocked(procurementApi.ruleGroups).mockRejectedValue(new Error('后端未连接'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('后端未连接')
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
  })
})
