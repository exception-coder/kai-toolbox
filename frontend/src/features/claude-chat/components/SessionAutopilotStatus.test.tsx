import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AutopilotDashboard as AutopilotDashboardView, SessionAutopilotRun } from '../types'
import { AutopilotDashboard } from './AutopilotDashboard'
import { SessionAutopilotStatus } from './SessionAutopilotStatus'

const getSessionAutopilot = vi.fn()
const listSessionOpenSpecChanges = vi.fn()
const previewAutopilotBindings = vi.fn()
const checkAutopilotBinding = vi.fn()
const listAutopilotRuns = vi.fn()
const controlSessionAutopilot = vi.fn()
const startSessionAutopilot = vi.fn()
const recommendAutopilotBindings = vi.fn()
const getAutopilotBatch = vi.fn()
const listAutopilotTasks = vi.fn()

vi.mock('../api', () => ({
  listAutopilotTasks: (...args: unknown[]) => listAutopilotTasks(...args),
  getSessionAutopilot: (...args: unknown[]) => getSessionAutopilot(...args),
  listSessionOpenSpecChanges: (...args: unknown[]) => listSessionOpenSpecChanges(...args),
  previewAutopilotBindings: (...args: unknown[]) => previewAutopilotBindings(...args),
  checkAutopilotBinding: (...args: unknown[]) => checkAutopilotBinding(...args),
  listAutopilotRuns: (...args: unknown[]) => listAutopilotRuns(...args),
  controlSessionAutopilot: (...args: unknown[]) => controlSessionAutopilot(...args),
  startSessionAutopilot: (...args: unknown[]) => startSessionAutopilot(...args),
  recommendAutopilotBindings: (...args: unknown[]) => recommendAutopilotBindings(...args),
  getAutopilotBatch: (...args: unknown[]) => getAutopilotBatch(...args),
}))

const RUN: SessionAutopilotRun = {
  id: 'run-1', sessionId: 'session-1', goal: '完成上传能力', completionPolicy: 'OPEN_SPEC_STRICT',
  state: 'ACTIVE', reason: 'Runtime 自动续跑同一 task', phase: 'APPLY', projectRoot: 'D:/repo',
  repositoryIdentity: 'D:/repo', branchAtStart: 'feature/upload', workspaceFingerprint: 'workspace-hash',
  changeId: 'sample-image-upload', changeRevision: 'change-hash', currentTaskId: '6.4',
  currentTaskOrdinal: 28, agentSessionRef: 'codex-session-1', generation: 2, version: 7,
  turnCount: 5, maxTurns: 60, noProgressCount: 0, maxNoProgress: 3, autoArchive: true,
  layers: { agentSkillProvisioned: true, agentSkillActivated: true, skillPath: '.agents/skills/forge-openspec-continuous-execution/SKILL.md', skillVersion: '1.0.0', skillFingerprint: 'skill-hash', forgeRuntimeActive: true },
  progress: { completedTasks: 27, totalTasks: 36 }, latestReport: null,
  artifactPaths: { specs: ['openspec/changes/sample-image-upload/specs/sample-image/spec.md'] },
  startedAt: '2026-09-02T09:00:00Z', deadlineAt: '2026-09-02T17:00:00Z', updatedAt: new Date().toISOString(),
}

function renderWithClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  getAutopilotBatch.mockResolvedValue(null)
})

recommendAutopilotBindings.mockResolvedValue([])
getAutopilotBatch.mockResolvedValue(null)

describe('OpenSpec 自动监督体验', () => {
  it('只统计未完成的明确人工标记，读取所选批次而非全项目', async () => {
    getSessionAutopilot.mockResolvedValue(RUN)
    getAutopilotBatch.mockResolvedValue({ changeIds: [RUN.changeId, 'organization'], currentIndex: 0, deferred: [] })
    listAutopilotTasks.mockImplementation(async (_session: string, id: string) => id === 'organization' ? [
      { id: '1', description: '本地编码', done: true },
      { id: '2', description: '[MANUAL_CONFIRMATION] 来源键核实', done: false },
      { id: '3', description: '[MANUAL_PRODUCTION] 目标环境验收', done: false },
      { id: '4', description: '[MANUAL_CONFIRMATION] 已核实事项', done: true },
      { id: '5', description: '尚未实现的普通开发任务', done: false },
    ] : [])
    renderWithClient(<SessionAutopilotStatus sessionId="session-1" projectRoot="D:/repo" onOpenDashboard={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '展开自动监督详情' }))
    expect(await screen.findByText('人工确认 1 · 生产验收 1')).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
    expect(listAutopilotTasks).toHaveBeenCalledWith('session-1', 'organization')
    expect(listSessionOpenSpecChanges).not.toHaveBeenCalled()
  })

  it('AI 推荐优先显示，多选规格逐项预检后按勾选顺序启动', async () => {
    getSessionAutopilot.mockResolvedValue(null)
    previewAutopilotBindings.mockResolvedValue(['unrelated', 'implement-iam-access', 'implement-iam-organization'].map(changeId => ({
      changeId, completedTasks: 1, totalTasks: 10, revision: '', relevance: 0, ready: false, reason: '选择后检查规格',
    })))
    recommendAutopilotBindings.mockResolvedValue(['implement-iam-organization', 'implement-iam-access'])
    checkAutopilotBinding.mockImplementation(async (_sessionId: string, changeId: string) => ({
      changeId, completedTasks: 1, totalTasks: 10, revision: `rev-${changeId}`,
      relevance: 0, ready: true, reason: '规格校验通过，可以绑定并推进',
    }))
    startSessionAutopilot.mockResolvedValue(RUN)
    renderWithClient(<SessionAutopilotStatus sessionId="session-1" projectRoot="D:/repo" onOpenDashboard={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '自动推进' }))
    expect(await screen.findByText('implement-iam-organization')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /implement-iam-organization/ })).toBeChecked())
    fireEvent.click(screen.getByRole('checkbox', { name: /implement-iam-access/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '确认并推进' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '确认并推进' }))
    await waitFor(() => expect(startSessionAutopilot).toHaveBeenCalledWith('session-1', expect.objectContaining({
      changeIds: ['implement-iam-organization', 'implement-iam-access'],
      expectedRevisions: {
        'implement-iam-organization': 'rev-implement-iam-organization',
        'implement-iam-access': 'rev-implement-iam-access',
      },
    })))
  })
  it('候选读取失败时显示错误，不提示创建新规格', async () => {
    getSessionAutopilot.mockResolvedValue(null)
    previewAutopilotBindings.mockRejectedValue(new Error('读取 OpenSpec changes 失败：CLI 输出超过上限'))
    renderWithClient(<SessionAutopilotStatus sessionId="session-1" projectRoot="D:/repo" onOpenDashboard={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '自动推进' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('CLI 输出超过上限')
    expect(screen.queryByText(/当前项目缺少可绑定/)).not.toBeInTheDocument()
  })
  it('缺少规格时主动请求补齐并在校验通过后自动推进', async () => {
    getSessionAutopilot.mockResolvedValue(null)
    previewAutopilotBindings.mockResolvedValueOnce([]).mockResolvedValue([
      { changeId: 'upload-images', completedTasks: 0, totalTasks: 3, revision: '', relevance: 100, ready: false, reason: '选择后检查规格' },
    ])
    checkAutopilotBinding.mockResolvedValue({ changeId: 'upload-images', completedTasks: 0, totalTasks: 3,
      revision: 'rev-new', relevance: 0, ready: true, reason: '规格校验通过，可以绑定并推进' })
    startSessionAutopilot.mockResolvedValue(RUN)
    const supplement = vi.fn()
    const props = { sessionId: 'session-1', projectRoot: 'D:/repo', onOpenDashboard: vi.fn(), onSupplementSpec: supplement }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={client}><SessionAutopilotStatus {...props} agentRunning={false} /></QueryClientProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '自动推进' }))
    fireEvent.click(await screen.findByRole('button', { name: '补齐规格并继续' }))
    expect(supplement).toHaveBeenCalledWith(null)
    view.rerender(<QueryClientProvider client={client}>
      <SessionAutopilotStatus {...props} agentRunning />
    </QueryClientProvider>)
    view.rerender(<QueryClientProvider client={client}>
      <SessionAutopilotStatus {...props} agentRunning={false} />
    </QueryClientProvider>)
    await waitFor(() => expect(startSessionAutopilot).toHaveBeenCalledWith('session-1', expect.objectContaining({ changeId: 'upload-images', expectedRevision: 'rev-new' })))
  })
  it('一句话请求展示推荐规格，确认时带预检修订启动', async () => {
    getSessionAutopilot.mockResolvedValue(null)
    previewAutopilotBindings.mockResolvedValue([
      { changeId: 'upload-images', completedTasks: 1, totalTasks: 3, revision: '', relevance: 100, ready: false, reason: '选择后检查规格' },
      { changeId: 'draft', completedTasks: 0, totalTasks: 0, revision: '', relevance: 0, ready: false, reason: '选择后检查规格' },
    ])
    checkAutopilotBinding.mockResolvedValue({ changeId: 'upload-images', completedTasks: 1, totalTasks: 3, revision: 'rev-1', relevance: 0, ready: true, reason: '规格校验通过，可以绑定并推进' })
    startSessionAutopilot.mockResolvedValue(RUN)
    renderWithClient(<SessionAutopilotStatus sessionId="session-1" projectRoot="D:/repo" onOpenDashboard={vi.fn()} />)
    await screen.findByText(/尚未监督/)
    window.dispatchEvent(new CustomEvent('claude-chat:autopilot-bind-request', { detail: 'session-1' }))
    expect(await screen.findByRole('dialog', { name: '选择当前会话的执行规格' })).toBeInTheDocument()
    expect(await screen.findByText('upload-images')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '确认并推进' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '确认并推进' }))
    await waitFor(() => expect(startSessionAutopilot).toHaveBeenCalledWith('session-1', expect.objectContaining({ changeId: 'upload-images', expectedRevision: 'rev-1' })))
  })
  it('展示当前会话绑定的 spec 与两层独立兜底状态', async () => {
    getSessionAutopilot.mockResolvedValue(RUN)
    listSessionOpenSpecChanges.mockResolvedValue([])

    renderWithClient(<SessionAutopilotStatus sessionId="session-1" projectRoot="D:/repo" onOpenDashboard={vi.fn()} />)

    expect(await screen.findByText('OpenSpec · sample-image-upload')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /OpenSpec · sample-image-upload/ }))
    expect(await screen.findByText('Forge Runtime 已接管 · Agent Skill 已加载')).toBeInTheDocument()
    expect(screen.getByText('执行上下文').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('openspec/changes/sample-image-upload/specs/sample-image/spec.md')).toBeInTheDocument()
  })

  it('看板通过可聚焦控件进入会话并暂停运行', async () => {
    const dashboard: AutopilotDashboardView = {
      items: [{ run: RUN, sessionTitle: '样衣管理', projectName: 'kai-toolbox', engine: 'codex', sessionStatus: 'IDLE', lastActivityAt: Date.now() }],
      counts: { active: 1, attention: 0, paused: 0, recent: 0 }, nextCursor: null,
      snapshotAt: new Date().toISOString(),
    }
    listAutopilotRuns.mockResolvedValue(dashboard)
    controlSessionAutopilot.mockResolvedValue({ ...RUN, state: 'PAUSED' })
    const onOpen = vi.fn()

    renderWithClient(<AutopilotDashboard onOpenSession={onOpen} />)

    expect(await screen.findByRole('button', { name: /进入 样衣管理/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /进入 样衣管理/ }))
    expect(onOpen).toHaveBeenCalledWith('session-1')
    fireEvent.click(screen.getByRole('button', { name: '暂停监督' }))
    await waitFor(() => expect(controlSessionAutopilot).toHaveBeenCalledWith('session-1', 'pause', 7))
  })

  it('全部推进只按当前会话持久绑定标记运行并跳转', async () => {
    listAutopilotRuns.mockResolvedValue({
      items: [{ run: RUN, sessionTitle: '上传开发', projectName: 'kai-toolbox', engine: 'codex', sessionStatus: 'IDLE', lastActivityAt: Date.now() }],
      counts: { active: 1, attention: 0, paused: 0, recent: 0 }, nextCursor: null,
      snapshotAt: new Date().toISOString(),
    } satisfies AutopilotDashboardView)
    getSessionAutopilot.mockResolvedValue(RUN)
    getAutopilotBatch.mockResolvedValue({ changeIds: ['sample-image-upload', 'implement-iam-access'], currentIndex: 0, deferred: [] })
    const onOpen = vi.fn()
    renderWithClient(<AutopilotDashboard initialScope="all" currentSessionId="session-1" onOpenSession={onOpen} />)
    expect((await screen.findAllByText('本会话')).length).toBeGreaterThan(0)
    expect(screen.getByText('本会话已绑定的规格')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'implement-iam-access' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'unrelated-change' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /全部\s*1/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /进入 上传开发/ }))
    expect(onOpen).toHaveBeenCalledWith('session-1')
    expect(listAutopilotRuns).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all' }))
  })

  it('未绑定时不把同项目候选误列为当前会话规格', async () => {
    const snapshot = { counts: { active: 1, attention: 0, paused: 0, recent: 0 }, nextCursor: null, snapshotAt: new Date().toISOString() }
    listAutopilotRuns.mockResolvedValue({ ...snapshot, items: [{ run: RUN, sessionTitle: '其他会话', projectName: 'kai-toolbox', engine: 'codex', sessionStatus: 'IDLE', lastActivityAt: Date.now() }] })
    getSessionAutopilot.mockResolvedValue(null)
    const onOpen = vi.fn()
    renderWithClient(<AutopilotDashboard initialScope="all" currentSessionId="session-2" onOpenSession={onOpen} />)
    expect(await screen.findByText('尚未绑定自动推进规格；可在对话中打开“自动推进”选择。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'sample-image-upload' })).not.toBeInTheDocument()
    expect(getAutopilotBatch).not.toHaveBeenCalled()
  })

  it('移动端单行摘要可聚焦进入详情，桌面保留完整表格', async () => {
    const dashboard: AutopilotDashboardView = {
      items: [{ run: RUN, sessionTitle: '样衣管理', projectName: 'kai-toolbox', engine: 'codex', sessionStatus: 'IDLE', lastActivityAt: Date.now() }],
      counts: { active: 1, attention: 0, paused: 0, recent: 0 }, nextCursor: null,
      snapshotAt: new Date().toISOString(),
    }
    listAutopilotRuns.mockResolvedValue(dashboard)

    renderWithClient(<AutopilotDashboard onOpenSession={vi.fn()} />)

    const activeScope = await screen.findByRole('button', { name: /监督中\s*1/ })
    const refresh = screen.getByRole('button', { name: '刷新监督看板' })
    const pause = screen.getByRole('button', { name: '暂停监督' })
    for (const control of [activeScope, refresh, pause]) {
      expect(control).not.toHaveAttribute('tabindex', '-1')
      expect(control.className).toContain('focus-visible:ring-2')
      control.focus()
      expect(document.activeElement).toBe(control)
    }

    const mobileRow = screen.getByRole('button', { name: /进入 样衣管理/ })
    expect(mobileRow.className).toContain('md:hidden')
    expect(mobileRow.className).toContain('min-h-11')
    expect(mobileRow).toHaveTextContent('27/36')
    expect(mobileRow).toHaveTextContent('监督中')
    mobileRow.focus()
    expect(document.activeElement).toBe(mobileRow)
    const article = screen.getByText('sample-image-upload').closest('article')
    expect(article?.querySelector('.md\\:grid')).toBeInTheDocument()
    expect(screen.getByText('会话 / 项目').parentElement?.className).toContain('hidden')
    expect(screen.getByText('会话 / 项目').parentElement?.className).toContain('md:grid')
  })

  it('展示缓存过期提示和可恢复的上下文漂移原因', async () => {
    const drifted = { ...RUN, state: 'WAITING_USER' as const, reason: '检测到 EXECUTION_CONTEXT_DRIFT：分支已改变，请重新绑定后继续。' }
    listAutopilotRuns.mockResolvedValue({
      items: [{ run: drifted, sessionTitle: '报价联调', projectName: 'kai-toolbox', engine: 'codex', sessionStatus: 'IDLE', lastActivityAt: Date.now() }],
      counts: { active: 0, attention: 1, paused: 0, recent: 0 }, nextCursor: null,
      snapshotAt: new Date(Date.now() - 120_000).toISOString(),
    } satisfies AutopilotDashboardView)

    renderWithClient(<AutopilotDashboard onOpenSession={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /待处理\s*1/ }))

    expect(await screen.findByText('快照可能已过期')).toBeInTheDocument()
    expect(screen.getByText(/EXECUTION_CONTEXT_DRIFT/)).toBeInTheDocument()
    const mobileRow = screen.getByRole('button', { name: /进入 报价联调/ })
    expect(mobileRow).toHaveTextContent('待处理')
    expect(mobileRow).not.toHaveTextContent('EXECUTION_CONTEXT_DRIFT')
    expect(mobileRow).toHaveAccessibleName(/查看原因/)
    expect(screen.getByRole('button', { name: '恢复监督' })).toBeInTheDocument()
  })

  it('监督修订提示和页面重新可见时重新读取权威快照', async () => {
    const dashboard: AutopilotDashboardView = {
      items: [], counts: { active: 0, attention: 0, paused: 0, recent: 0 }, nextCursor: null,
      snapshotAt: new Date().toISOString(),
    }
    listAutopilotRuns.mockResolvedValue(dashboard)
    renderWithClient(<AutopilotDashboard onOpenSession={vi.fn()} />)
    expect(await screen.findByText('这个范围内没有受监督会话')).toBeInTheDocument()

    window.dispatchEvent(new CustomEvent('claude-chat:autopilot-changed', { detail: { revision: 2 } }))
    await waitFor(() => expect(listAutopilotRuns.mock.calls.length).toBeGreaterThanOrEqual(2))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(listAutopilotRuns.mock.calls.length).toBeGreaterThanOrEqual(3))
  })
})
