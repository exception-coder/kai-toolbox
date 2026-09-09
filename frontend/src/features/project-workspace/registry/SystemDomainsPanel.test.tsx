import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemDomainsPanel } from './SystemDomainsPanel'
import { exploreDomains, getDomains, type DomainView } from './domainApi'

vi.mock('./domainApi', () => ({ exploreDomains: vi.fn(), getDomains: vi.fn() }))
const empty: DomainView = { snapshot: null, run: null, stale: false, message: '尚未从代码探索领域，无需预先准备领域知识' }
const snapshot: NonNullable<DomainView['snapshot']> = {
  version: 2, generatedAt: 1, engine: 'codex', scope: '样衣', gaps: ['库存模块未覆盖'],
  domains: [{ id: 'samples', name: '样衣管理', kind: 'BUSINESS', confidence: 'MEDIUM', summary: '维护样衣及删除流程',
    responsibilities: ['删除样衣'], flows: ['入口→服务'], unknowns: ['事务待核实'], communities: ['21'], mappings: [],
    evidence: [{ path: 'SampleService.java', startLine: 1, endLine: 1, quote: 'class SampleService {}', nodeId: 'sample' }],
  }],
}
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SystemDomainsPanel projectId="forge" />
  </QueryClientProvider>)
}
describe('code-derived project domains', () => {
  afterEach(cleanup)
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getDomains).mockResolvedValue(empty) })

  it('starts with selected engine and optional scope without existing knowledge', async () => {
    vi.mocked(exploreDomains).mockResolvedValue({ id: 'run', engine: 'claude', scope: '样衣', status: 'RUNNING', stage: 'Agent 正在追踪代码', startedAt: 1, updatedAt: 1, error: null })
    show()
    await screen.findByText(empty.message)
    fireEvent.change(screen.getByLabelText('探索引擎'), { target: { value: 'claude' } })
    fireEvent.change(screen.getByLabelText('重点范围 · 可选'), { target: { value: '样衣' } })
    fireEvent.click(screen.getByRole('button', { name: '开始探索' }))
    await waitFor(() => expect(exploreDomains).toHaveBeenCalledWith('forge', 'claude', '样衣'))
  })

  it('keeps previous evidence and gaps visible after a failed exploration', async () => {
    vi.mocked(getDomains).mockResolvedValue({ ...empty, snapshot, stale: true, message: '源码已变化，需要重新探索',
      run: { id: 'run', engine: 'codex', scope: '', status: 'FAILED', stage: '探索未完成，上一版结果保留', startedAt: 1, updatedAt: 2, error: '源码引用不匹配' },
    })
    show()
    await screen.findByText('样衣管理')
    expect(screen.getByText('源码引用不匹配')).toBeTruthy()
    expect(screen.getByText('库存模块未覆盖')).toBeTruthy()
    expect(screen.getByText('需要关注')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新探索' })).toBeTruthy()
    fireEvent.click(screen.getByText('职责、流程与 1 条源码证据'))
    expect(screen.getByText('1. SampleService.java:1–1')).toBeTruthy()
    expect(screen.getByText('业务域 · 代码推断 · 置信度中')).toBeTruthy()
  })

  it('prevents duplicate runs while preserving the previous snapshot', async () => {
    vi.mocked(getDomains).mockResolvedValue({ ...empty, snapshot,
      run: { id: 'run', engine: 'codex', scope: '', status: 'RUNNING', stage: 'Agent 正在追踪代码', startedAt: 1, updatedAt: 1, error: null },
    })
    show()
    await screen.findByText('Agent 正在追踪代码')
    expect((screen.getByRole('button', { name: '探索中…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('样衣管理')).toBeTruthy()
  })
})
