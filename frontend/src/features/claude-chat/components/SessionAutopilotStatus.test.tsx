import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AutopilotDashboard as AutopilotDashboardView, SessionAutopilotRun } from '../types'
import { AutopilotDashboard } from './AutopilotDashboard'
import { SessionAutopilotStatus } from './SessionAutopilotStatus'

const getSessionAutopilot = vi.fn()
const listSessionOpenSpecChanges = vi.fn()
const listAutopilotRuns = vi.fn()
const controlSessionAutopilot = vi.fn()
const startSessionAutopilot = vi.fn()

vi.mock('../api', () => ({
  getSessionAutopilot: (...args: unknown[]) => getSessionAutopilot(...args),
  listSessionOpenSpecChanges: (...args: unknown[]) => listSessionOpenSpecChanges(...args),
  listAutopilotRuns: (...args: unknown[]) => listAutopilotRuns(...args),
  controlSessionAutopilot: (...args: unknown[]) => controlSessionAutopilot(...args),
  startSessionAutopilot: (...args: unknown[]) => startSessionAutopilot(...args),
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
})

describe('OpenSpec 自动监督体验', () => {
  it('展示当前会话绑定的 spec 与两层独立兜底状态', async () => {
    getSessionAutopilot.mockResolvedValue(RUN)
    listSessionOpenSpecChanges.mockResolvedValue([])

    renderWithClient(<SessionAutopilotStatus sessionId="session-1" projectRoot="D:/repo" onOpenDashboard={vi.fn()} />)

    expect(await screen.findByText('OpenSpec · sample-image-upload')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /OpenSpec · sample-image-upload/ }))
    expect(await screen.findByText('已由引擎加载')).toBeInTheDocument()
    expect(screen.getByText('正在监督')).toBeInTheDocument()
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

    expect(await screen.findByText('样衣管理')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /样衣管理/ }))
    expect(onOpen).toHaveBeenCalledWith('session-1')
    fireEvent.click(screen.getByRole('button', { name: '暂停监督' }))
    await waitFor(() => expect(controlSessionAutopilot).toHaveBeenCalledWith('session-1', 'pause', 7))
  })

  it('为键盘操作提供显式焦点样式，并保持窄屏优先的单列行结构', async () => {
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

    const article = screen.getByText('sample-image-upload').closest('article')
    const row = article?.firstElementChild
    expect(row?.className).toContain('grid gap-2')
    expect(row?.className).toContain('md:min-w-[980px]')
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
