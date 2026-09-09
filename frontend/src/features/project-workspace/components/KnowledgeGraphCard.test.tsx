import { Profiler } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { graphifyStatus, domainKnowledgeStatus, crossTopologyStatus, repoPaths } from '@/features/knowledge-graph/public-api'
import { KnowledgeGraphCard } from './KnowledgeGraphCard'

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/features/claude-chat/public-api', () => ({ EngineIcon: () => null, engineName: (name: string) => name }))
vi.mock('@/features/knowledge-graph/public-api', async importOriginal => ({
  ...await importOriginal<object>(), graphifyStatus: vi.fn(), domainKnowledgeStatus: vi.fn(), crossTopologyStatus: vi.fn(), repoPaths: vi.fn(),
}))

const path = 'D:/project'
const status = { state: 'STALE' as const, graphGeneratedAt: null, latestCommitAt: null, checkedAt: '2026-09-09T12:00:00Z' }
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const commit = vi.fn()
  render(<QueryClientProvider client={client}><MemoryRouter><Profiler id="panel" onRender={commit}>
    <KnowledgeGraphCard projectPath={path} projectName="ERP" snapshot={{ projectPath: path, graphifyState: 'UP_TO_DATE', businessGraphState: null, businessGraphError: null, checkedAt: '2026-08-05T00:00:00Z' }} />
  </Profiler></MemoryRouter></QueryClientProvider>)
  return { client, commit }
}

describe('knowledge panel request isolation', () => {
  afterEach(cleanup)
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(graphifyStatus).mockResolvedValue(status) })

  it('expands cached evidence without disk checks and remains locally collapsible', () => {
    const { commit } = show()
    fireEvent.click(screen.getByRole('button', { name: '知识图谱' }))
    expect(screen.getByText(/历史检测于/)).toBeInTheDocument()
    expect(graphifyStatus).not.toHaveBeenCalled()
    expect(repoPaths).not.toHaveBeenCalled()
    expect(domainKnowledgeStatus).not.toHaveBeenCalled()
    expect(crossTopologyStatus).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '知识图谱' }))
    expect(screen.queryByRole('button', { name: '检查最新状态' })).not.toBeInTheDocument()
    expect(commit.mock.calls.length).toBeLessThan(10)
  })

  it('checks only Graphify on demand and immediately replaces its stale summary', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: '知识图谱' }))
    fireEvent.click(screen.getByRole('button', { name: '检查最新状态' }))
    await screen.findByText('Graphify · 已过时')
    expect(graphifyStatus).toHaveBeenCalledTimes(1)
    expect(domainKnowledgeStatus).not.toHaveBeenCalled()
    expect(crossTopologyStatus).not.toHaveBeenCalled()
  })

  it('cancels a pending status fetch when collapsed and does not restart on reopen', async () => {
    let signal: AbortSignal | undefined
    vi.mocked(graphifyStatus).mockImplementation((_path, nextSignal) => { signal = nextSignal; return new Promise(() => {}) })
    show()
    fireEvent.click(screen.getByRole('button', { name: '知识图谱' }))
    fireEvent.click(screen.getByRole('button', { name: '检查最新状态' }))
    await waitFor(() => expect(signal).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: '知识图谱' }))
    expect(signal?.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '知识图谱' }))
    expect(graphifyStatus).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '检查最新状态' })).toBeEnabled()
  })

  it('does not retry failures automatically and allows an explicit retry', async () => {
    vi.mocked(graphifyStatus).mockRejectedValueOnce(new Error('检测超时'))
    show()
    fireEvent.click(screen.getByRole('button', { name: '知识图谱' }))
    fireEvent.click(screen.getByRole('button', { name: '检查最新状态' }))
    await screen.findByText('检测超时')
    expect(graphifyStatus).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '检查最新状态' }))
    await screen.findByText('Graphify · 已过时')
    expect(graphifyStatus).toHaveBeenCalledTimes(2)
  })
})
