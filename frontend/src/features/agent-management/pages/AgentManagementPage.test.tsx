import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { AgentManagementPage } from './AgentManagementPage'
import { LegacyEvaluationRedirect } from './LegacyEvaluationRedirect'
import { getAgent, listAgents, type AgentManagementSnapshot, type AgentVersion } from '../api'
import * as evaluationApi from '../evaluation/api'
import type { EvalRun } from '../evaluation/types'

vi.mock('../api')
vi.mock('../evaluation/api')

const version: AgentVersion = {
  version: 1, status: 'CANDIDATE', model: 'test-model', temperature: 0.2, promptRef: 'test-prompt',
  orchestrationVersion: 'v4', tools: [], mcpServers: [], skills: [], evaluationRunId: null,
  evaluationScore: null, evaluationPassed: false, createdAt: 1, releasedAt: null,
}
const agent: AgentManagementSnapshot = {
  id: 'business-consult', name: '业务咨询 Agent', owner: 'IT', description: '业务咨询', endpoint: '/consult',
  framework: 'test', observabilityUrl: null, candidateVersion: version, productionVersion: null,
  versions: [version], evaluationDataset: { id: 'consult-cases', name: '咨询题集', baselineStatus: 'PENDING_HUMAN_BASELINE', cases: [] },
  releaseGate: { releasable: false, minimumScore: 95, reason: '尚未评测' },
}
const run: EvalRun = { id: 'run-1', scenario: 'business_consult', dataset: 'consult-cases', adapter: 'business-consult',
  status: 'SUCCESS', total: 2, passed: 2, failed: 0, errored: 0, startedAt: 1 }

function mount(url = '/tools/agent-management') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = { state: { location: { pathname: '', search: '', hash: '' }, historyAction: '' } }
  function ObserveLocation() {
    router.state = { location: useLocation(), historyAction: useNavigationType() }
    return null
  }
  render(<QueryClientProvider client={client}><ConfirmProvider><MemoryRouter initialEntries={[url]}>
    <ObserveLocation />
    <Routes>
      <Route path="/tools/agent-management" element={<AgentManagementPage />} />
      <Route path="/tools/eval" element={<LegacyEvaluationRedirect />} />
    </Routes>
  </MemoryRouter></ConfirmProvider></QueryClientProvider>)
  return router
}

beforeEach(() => {
  vi.mocked(listAgents).mockResolvedValue([agent])
  vi.mocked(getAgent).mockResolvedValue(agent)
  vi.mocked(evaluationApi.listDatasets).mockResolvedValue([
    { dataset: 'consult-cases', scenario: 'business_consult', total: 2, enabledCount: 2 },
    { dataset: 'bug-cases', scenario: 'EXTRACTION', total: 1, enabledCount: 1 },
  ])
  vi.mocked(evaluationApi.listAdapters).mockResolvedValue([
    { id: 'business-consult', scenario: 'business_consult', promptKey: 'consult' },
    { id: 'bug-extraction', scenario: 'EXTRACTION', promptKey: 'bug' },
  ])
  vi.mocked(evaluationApi.listSources).mockResolvedValue([])
  vi.mocked(evaluationApi.listRuns).mockResolvedValue([run])
  vi.mocked(evaluationApi.listResults).mockResolvedValue([])
  vi.mocked(evaluationApi.startRun).mockResolvedValue({ ...run, id: 'run-new' })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('Agent 集中管理', () => {
  it('redirects legacy links without losing query or hash', async () => {
    const router = mount('/tools/eval?dataset=consult-cases&run=run-1#results')
    await screen.findByRole('heading', { name: '回归评测' })
    expect(router.state.location.pathname).toBe('/tools/agent-management')
    expect(new URLSearchParams(router.state.location.search).get('run')).toBe('run-1')
    expect(router.state.location.hash).toBe('#results')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: '评测中心' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens agent evaluation with its dataset and returns to the same agent', async () => {
    const router = mount('/tools/agent-management?agent=business-consult&tab=evaluation')
    fireEvent.click(await screen.findByRole('link', { name: '打开评测中心 →' }))
    const context = await screen.findByRole('region', { name: '评测来源' })
    expect(context).toHaveTextContent('业务咨询 Agent')
    await waitFor(() => expect(screen.getByLabelText('数据集')).toHaveValue('consult-cases'))
    expect(screen.getByText(/尚不验证候选版本的完整配置/)).toBeInTheDocument()
    fireEvent.click(within(context).getByRole('link', { name: '返回 Agent 详情' }))
    await screen.findByRole('link', { name: '打开评测中心 →' })
    expect(new URLSearchParams(router.state.location.search).get('agent')).toBe('business-consult')
  })

  it('keeps an unsaved candidate while switching workspace views', async () => {
    mount('/tools/agent-management?tab=evaluation')
    const input = await screen.findByLabelText('评测运行编号 · Evaluation run ID')
    fireEvent.change(input, { target: { value: 'unsaved-run' } })
    fireEvent.click(screen.getByRole('link', { name: '评测中心' }))
    await screen.findByRole('heading', { name: '回归评测' })
    fireEvent.click(screen.getByRole('link', { name: 'Agent 列表' }))
    expect(screen.getByLabelText('评测运行编号 · Evaluation run ID')).toHaveValue('unsaved-run')
  })

  it('restores report selection and clears it when changing datasets', async () => {
    const router = mount('/tools/agent-management?section=evaluation&dataset=consult-cases&run=run-1')
    const select = await screen.findByLabelText('数据集')
    await waitFor(() => expect(evaluationApi.listResults).toHaveBeenCalledWith('run-1'))
    fireEvent.change(select, { target: { value: 'bug-cases' } })
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('dataset')).toBe('bug-cases'))
    expect(new URLSearchParams(router.state.location.search).has('run')).toBe(false)
    expect(screen.getByLabelText('被测 Agent / 能力')).toHaveValue('bug-extraction')
    expect(within(screen.getByLabelText('被测 Agent / 能力')).queryByText(/业务咨询 Agent/)).toBeNull()
  })

  it('blocks a missing dataset and offers recovery', async () => {
    mount('/tools/agent-management?section=evaluation&dataset=missing&agent=business-consult')
    expect(await screen.findByText(/题集「missing」尚未纳入/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始评测' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '检查样本来源' })).toHaveAttribute('href', '#evaluation-sources')
    fireEvent.click(screen.getByRole('link', { name: '查看全部评测' }))
    expect(screen.getByLabelText('数据集')).toHaveValue('')
  })

  it('recovers an unavailable API and runs through the existing evaluation contract', async () => {
    vi.mocked(evaluationApi.listDatasets).mockRejectedValueOnce(new Error('评测目录暂不可用'))
    mount('/tools/agent-management?section=evaluation&dataset=consult-cases')
    expect(await screen.findByRole('alert')).toHaveTextContent('评测目录暂不可用')
    fireEvent.click(screen.getByRole('button', { name: '重试加载评测' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '开始评测' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '开始评测' }))
    await waitFor(() => expect(evaluationApi.startRun).toHaveBeenCalledWith({ adapter: 'business-consult', dataset: 'consult-cases' }))
  })
})
