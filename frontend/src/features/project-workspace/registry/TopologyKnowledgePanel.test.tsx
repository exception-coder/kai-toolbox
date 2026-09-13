import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listRegistry } from './api'
import { getTopology, exploreTopology, type TopologyView } from './topologyApi'
import { SystemDomainsPanel } from './SystemDomainsPanel'
import { getDomains } from './domainApi'

vi.mock('./api', () => ({ listRegistry: vi.fn() }))
vi.mock('./topologyApi', () => ({ getTopology: vi.fn(), exploreTopology: vi.fn() }))
vi.mock('./domainApi', () => ({ getDomains: vi.fn(), exploreDomains: vi.fn() }))
const empty: TopologyView = { snapshot: null, run: null, stale: false, message: '请选择关联项目' }
const snapshot: NonNullable<TopologyView['snapshot']> = {
  version: 1, generatedAt: 1, engine: 'codex', scope: '订单', gaps: ['部署地址未核实'],
  participants: ['a', 'b'].map(id => ({ projectId: id, name: id === 'a' ? '订单系统' : '库存系统', root: `D:/${id}`,
    findings: { domains: [{ id: 'api', name: '接口', kind: 'TECHNICAL', summary: '', confidence: 'LOW', responsibilities: [], flows: [], mappings: [], unknowns: [], communities: [],
      evidence: [{ path: 'Api.java', startLine: 1, endLine: 1, nodeId: 'api', quote: `class Api${id} {}` }] }], gaps: [] } })),
  relations: [{ id: 'api-link', fromProjectId: 'a', toProjectId: 'b', kind: 'API', summary: '订单引用库存接口', confidence: 'LOW', unknowns: ['运行调用未验证'],
    evidence: [{ projectId: 'a', domainId: 'api', evidenceIndex: 0 }, { projectId: 'b', domainId: 'api', evidenceIndex: 0 }] }],
}
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SystemDomainsPanel projectId="a" /></QueryClientProvider>)
}
describe('unified knowledge exploration', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDomains).mockResolvedValue({ snapshot: null, run: null, stale: false, message: '领域尚未探索' })
    vi.mocked(getTopology).mockResolvedValue(empty)
    vi.mocked(listRegistry).mockResolvedValue(['a', 'b', 'c', 'd', 'e'].map(id => ({ id, metadata: { name: `项目${id}`, localPath: `D:/${id}`, repoType: 'local', repoUrl: '', defaultBranch: '', devUrl: '', testUrl: '', owner: '' }, state: 'AI_READY', profileVersion: 1, createdAt: 1, updatedAt: 1 })))
  })
  it('loads topology only when selected and requires explicit participant selection', async () => {
    show()
    await screen.findByText('领域尚未探索')
    expect(getTopology).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '跨项目关系' }))
    await screen.findByText('项目b')
    expect(screen.getByRole('button', { name: '开始探索关系' })).toBeDisabled()
    for (const id of ['b', 'c', 'd']) fireEvent.click(screen.getByLabelText(new RegExp(`项目${id}`)))
    expect(screen.getByLabelText(/项目e/)).toBeDisabled()
    vi.mocked(exploreTopology).mockResolvedValue({ id: 'run', engine: 'codex', scope: '', status: 'RUNNING', stage: '读取基线', startedAt: 1, updatedAt: 1, error: null })
    fireEvent.click(screen.getByRole('button', { name: '开始探索关系' }))
    await waitFor(() => expect(exploreTopology).toHaveBeenCalledWith('a', { engine: 'codex', scope: '', projectIds: ['a', 'b', 'c', 'd'] }))
  })
  it('keeps stale evidence visible after failure and never labels it confirmed', async () => {
    vi.mocked(getTopology).mockResolvedValue({ ...empty, snapshot, stale: true, run: { id: 'run', engine: 'codex', scope: '', status: 'FAILED', stage: '旧结果保留', error: '引用校验失败', startedAt: 1, updatedAt: 2 } })
    show()
    fireEvent.click(screen.getByRole('button', { name: '跨项目关系' }))
    await screen.findByText('订单引用库存接口')
    expect(screen.getByText('证据过期')).toBeInTheDocument()
    expect(screen.getByText('引用校验失败')).toBeInTheDocument()
    expect(screen.queryByText('已确认')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('查看 2 条双端源码证据'))
    expect(screen.getByText('class Apia {}')).toBeInTheDocument()
    expect(screen.getByText('class Apib {}')).toBeInTheDocument()
  })
  it('offers registration recovery when no related projects exist', async () => {
    vi.mocked(listRegistry).mockResolvedValue([])
    show()
    fireEvent.click(screen.getByRole('button', { name: '跨项目关系' }))
    expect(await screen.findByRole('link', { name: '接入关联项目' })).toHaveAttribute('href', '/tools/project-workspace?section=local')
    expect(screen.getByRole('button', { name: '开始探索关系' })).toBeDisabled()
  })
})
