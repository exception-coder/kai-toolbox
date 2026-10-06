import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { SessionAutopilotRun } from '../types'
import { SupervisionSummary } from './SupervisionSummary'
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

const now = Date.parse('2026-09-02T10:00:00Z')
afterEach(cleanup)
function mount(run = RUN, extra: Partial<ComponentProps<typeof SupervisionSummary>> = {}) {
  const onAction = vi.fn()
  render(<SupervisionSummary run={run} now={now} pending={false} onAction={onAction}
    projectControl={<span>项目编码门禁</span>} onRetry={vi.fn()} {...extra} />)
  return onAction
}
it('distinguishes completion from budget risk and keeps context unknown', () => {
  const action = mount({ ...RUN, progress: { completedTasks: 98, totalTasks: 100 }, turnCount: 59 })
  expect(screen.getByRole('progressbar', { name: '执行进度' }).firstChild).not.toHaveClass('bg-amber-600')
  expect(screen.getByRole('progressbar', { name: '轮次预算' }).firstChild).toHaveClass('bg-amber-600')
  expect(screen.queryByRole('progressbar', { name: '上下文' })).toBeNull()
  expect(screen.queryByRole('button', { name: '恢复' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '停止' }))
  expect(action).toHaveBeenCalledWith('stop')
  expect(screen.getByText('执行上下文').closest('details')).not.toHaveAttribute('open')
})
it('promotes unresolved issues and excludes completed manual tasks', () => {
  mount({ ...RUN, state: 'PAUSED' }, { batch: { changeIds: [RUN.changeId, 'access'], currentIndex: 0,
    deferred: [{ changeId: 'access', reason: '规格变化，等待重新预检' }] }, taskQueries: [{ data: [
      { id: '1.1', applyOrdinal: 1, description: '[MANUAL_CONFIRMATION] 待核实', done: false },
      { id: '1.2', applyOrdinal: 2, description: '[MANUAL_PRODUCTION] 已验收', done: true },
    ], refetch: vi.fn() }] })
  const region = screen.getByRole('region', { name: '需要处理' })
  expect(within(region).getByText('Task 1.1 待人工确认')).toBeInTheDocument()
  expect(within(region).getByText('规格变化，等待重新预检')).toBeInTheDocument()
  expect(within(region).queryByText(/1.2/)).toBeNull()
  expect(screen.getByRole('button', { name: '恢复' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '停止' })).toBeNull()
})
it('keeps failed reads recoverable and invalid or zero limits unquantified', () => {
  const retry = vi.fn()
  mount({ ...RUN, deadlineAt: 'invalid', progress: { completedTasks: 0, totalTasks: 0 } }, { error: '连接失败', onRetry: retry })
  expect(screen.getByRole('alert')).toHaveTextContent('上次已知状态')
  fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.queryByRole('progressbar', { name: '执行进度' })).toBeNull()
  expect(screen.queryByRole('progressbar', { name: '监督窗口' })).toBeNull()
})
