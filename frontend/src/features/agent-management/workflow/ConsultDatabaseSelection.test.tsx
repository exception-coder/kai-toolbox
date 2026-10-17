import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsultDatabaseSelection } from './ConsultDatabaseSelection'
import { ConsultDatabaseSelection as PublicSelection } from '../public-api'
import { createAgentCandidate, getAgent, getConsultResources, releaseAgentCandidate, type AgentVersion, type AgentManagementSnapshot } from '../api'
import { usePermission } from '@/shell/permission'

vi.mock('@/shell/permission', () => ({ usePermission: vi.fn() }))
vi.mock('../api', () => ({ getAgent: vi.fn(), getConsultResources: vi.fn(), getWorkflowDefaults: vi.fn(), createAgentCandidate: vi.fn(), releaseAgentCandidate: vi.fn() }))
const version: AgentVersion = { version: 5, status: 'PRODUCTION', model: 'unchanged-model', temperature: 0.2, promptRef: 'original-prompt', orchestrationVersion: 'v4',
  workflow: { nodes: [
    { id: 'knowledge', name: '知识', enabled: true, condition: '', instructions: '保留指令', queryConstraints: '', outputContract: '', tools: ['knowledge'], mcpServers: ['forge'] },
    { id: 'db', name: '查库', enabled: true, condition: '需要时', instructions: '只读', queryConstraints: 'SELECT', outputContract: '证据', tools: ['consult_resource_query'], mcpServers: ['consult-readonly'], resourceBindingIds: ['one'] },
  ] }, tools: ['knowledge', 'consult_resource_query'], mcpServers: ['forge', 'consult-readonly'], skills: ['existing-skill'], evaluationRunId: 'old-pass', evaluationScore: 99, evaluationPassed: true, createdAt: 1, releasedAt: 2 }
const snapshot: AgentManagementSnapshot = { id: 'business-consult', name: '咨询', owner: '', description: '', endpoint: '', framework: '', observabilityUrl: null,
  productionVersion: version, candidateVersion: null, versions: [version], releaseGate: { releasable: false, minimumScore: 95, reason: '请先保存候选' } }
beforeEach(() => {
  vi.mocked(getAgent).mockResolvedValue(structuredClone(snapshot))
  vi.mocked(getConsultResources).mockResolvedValue(['one', 'two'].map(bindingId => ({ bindingId, systemId: 'erp', systemName: 'ERP', name: bindingId, environment: 'TEST', purpose: '', state: 'AVAILABLE', configurationUrl: '' })))
  vi.mocked(usePermission).mockReturnValue(true)
  vi.mocked(createAgentCandidate).mockResolvedValue({ ...snapshot, candidateVersion: { ...version, version: 6, status: 'CANDIDATE', evaluationPassed: false, evaluationRunId: null, evaluationScore: null }, releaseGate: { releasable: true, minimumScore: 0, reason: '未评测；评测仅供参考' } })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
function mount(ui = <ConsultDatabaseSelection />) { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>) }

it('saves multiple database selections while preserving other nodes/model and clearing stale evaluation', async () => {
  mount()
  fireEvent.click(await screen.findByLabelText(/ERP · two/))
  fireEvent.click(screen.getByRole('button', { name: '保存数据库选择为候选' }))
  await waitFor(() => expect(createAgentCandidate).toHaveBeenCalled())
  const request = vi.mocked(createAgentCandidate).mock.calls[0][1]
  expect(request).toMatchObject({ model: 'unchanged-model', promptRef: 'original-prompt', skills: ['existing-skill'], evaluationRunId: null, evaluationScore: null, evaluationPassed: false })
  expect(request.workflow?.nodes[0]).toEqual(version.workflow!.nodes[0])
  expect(request.workflow?.nodes[1].resourceBindingIds).toEqual(['one', 'two'])
  expect(await screen.findByText(/数据库选择已保存为候选/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '发布候选' })).toBeEnabled()
  expect(screen.getByText(/可直接发布后验证/)).toBeInTheDocument()
  expect(releaseAgentCandidate).not.toHaveBeenCalled()
})

it('keeps failed selection edits for retry and never publishes an unsaved draft', async () => {
  vi.mocked(createAgentCandidate).mockRejectedValue(new Error('offline'))
  mount()
  fireEvent.click(await screen.findByLabelText(/ERP · two/))
  fireEvent.click(screen.getByRole('button', { name: '保存数据库选择为候选' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('草稿已保留')
  expect(screen.getByLabelText(/ERP · two/)).toBeChecked()
  expect(screen.getByRole('button', { name: '保存数据库选择为候选' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '发布候选' })).toBeDisabled()
})

it('detects a candidate updated elsewhere before saving instead of replacing it', async () => {
  mount()
  fireEvent.click(await screen.findByLabelText(/ERP · two/))
  vi.mocked(getAgent).mockResolvedValue({ ...snapshot, candidateVersion: { ...version, version: 9, status: 'CANDIDATE' } })
  fireEvent.click(screen.getByRole('button', { name: '保存数据库选择为候选' }))
  await screen.findByText(/候选版本已被其他操作更新/)
  expect(createAgentCandidate).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/ERP · two/)).toBeChecked()
})

it('publishes an unevaluated saved candidate through the existing release endpoint', async () => {
  const ready = { ...snapshot, candidateVersion: { ...version, version: 6, status: 'CANDIDATE' as const, evaluationRunId: null, evaluationScore: null, evaluationPassed: false }, releaseGate: { releasable: true, minimumScore: 0, reason: '未评测；评测仅供参考' } }
  vi.mocked(getAgent).mockResolvedValue(ready)
  vi.mocked(releaseAgentCandidate).mockResolvedValue({ ...ready, productionVersion: { ...version, version: 6 }, candidateVersion: null })
  mount()
  await waitFor(() => expect(screen.getByRole('button', { name: '发布候选' })).toBeEnabled())
  expect(screen.getByText(/评测：未评测；仅供参考，不限制发布/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '发布候选' }))
  expect(await screen.findByText(/候选已发布，对新咨询生效/)).toBeInTheDocument()
  expect(vi.mocked(releaseAgentCandidate).mock.calls[0].slice(0, 2)).toEqual(['business-consult', 6])
})

it('does not load Agent configuration without the original management permission', () => {
  vi.mocked(usePermission).mockReturnValue(false)
  mount(<PublicSelection />)
  expect(screen.getByText(/需要 Agent 管理权限/)).toBeInTheDocument()
  expect(getAgent).not.toHaveBeenCalled()
})
