import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateProgress, getProgressContent, getSession } from '../../api'
import type { DevDocEstimation, PrdSessionView } from '../../types'
import {
  EstimateEffortDialog,
  EstimationDetailSheet,
  EvaluateProgressDialog,
} from './EstimationDialogs'

vi.mock('../../api', () => ({
  evaluateProgress: vi.fn(),
  getProgressContent: vi.fn(),
  getSession: vi.fn(),
}))

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
})

const estimation: DevDocEstimation = {
  hoursMin: 4,
  hoursMax: 8,
  confidence: 'HIGH',
  reasoning: '已有相似模块',
  breakdown: [{ item: '接口改造', hours: 3 }],
  inspectedFiles: [],
  codeEvidenceSummary: '',
  assumptions: [],
  risks: [],
  engine: 'claude',
  projectPath: '',
  codeInspected: true,
  sourceSessionId: 'session-1',
  sourceTitle: '批量审批',
  workStatus: 'COMPLETED',
  workError: '',
  startedAt: 1,
  completedAt: 2,
  estimatedAt: 2,
  stale: true,
  staleReasons: ['开发文档已更新'],
}

describe('PRD 评估弹层', () => {
  const workSession = (status: PrdSessionView['progressWorkStatus'], error: string | null = null) => ({
    progressWorkStatus: status,
    progressWorkStage: status === 'RUNNING' ? '正在核查本地代码与测试' : null,
    progressWorkError: error,
  }) as PrdSessionView

  it('工时评估输入去除首尾空白后提交，并在加载时禁用操作', () => {
    const onConfirm = vi.fn()
    const { rerender } = render(
      <EstimateEffortDialog loading={false} onConfirm={onConfirm} onClose={vi.fn()} />,
    )

    fireEvent.change(screen.getByLabelText(/补充上下文/), { target: { value: '  一名开发  ' } })
    fireEvent.click(screen.getByRole('button', { name: '开始评估' }))
    expect(onConfirm).toHaveBeenCalledWith('一名开发')

    rerender(<EstimateEffortDialog loading onConfirm={onConfirm} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '评估中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
  })

  it('工时详情展示过期提示、信心和拆解项', () => {
    render(<EstimationDetailSheet estimation={estimation} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'AI 工时评估' })).toBeInTheDocument()
    expect(screen.getByText(/工时可能已经不准/)).toBeInTheDocument()
    expect(screen.getByText('信心：高')).toBeInTheDocument()
    expect(screen.getByText('接口改造')).toBeInTheDocument()
  })

  it('进度评估登记后台任务，完成后读取正式报告', async () => {
    const onGenerated = vi.fn()
    vi.mocked(getSession).mockResolvedValue(workSession('IDLE'))
    vi.mocked(evaluateProgress).mockResolvedValue(workSession('COMPLETED'))
    vi.mocked(getProgressContent).mockResolvedValue('# 评估报告')
    render(
      <EvaluateProgressDialog sessionId="session-1" onClose={vi.fn()} onGenerated={onGenerated} />,
    )

    fireEvent.change(screen.getByLabelText('补充核对重点（可选）'), { target: { value: '  核对库存  ' } })
    fireEvent.click(screen.getByRole('button', { name: '开始评估' }))
    expect(evaluateProgress).toHaveBeenCalledWith('session-1', '核对库存')
    expect(await screen.findByRole('heading', { name: '评估报告' })).toBeInTheDocument()
    expect(getProgressContent).toHaveBeenCalledWith('session-1')
    expect(onGenerated).toHaveBeenCalledOnce()
  })

  it('进度评估恢复后台运行态并允许关闭弹窗', async () => {
    vi.mocked(getSession).mockResolvedValue(workSession('RUNNING'))
    render(<EvaluateProgressDialog sessionId="session-1" onClose={vi.fn()} onGenerated={vi.fn()} />)
    expect(await screen.findByText('正在核查本地代码与测试')).toBeInTheDocument()
    expect(screen.getByText(/可以关闭弹窗、刷新页面/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭' })).toBeEnabled()
  })

  it('进度评估把后台错误恢复成可重试确认态', async () => {
    vi.mocked(getSession).mockResolvedValue(workSession('IDLE'))
    vi.mocked(evaluateProgress).mockResolvedValue(workSession('ERROR', '证据不足'))
    render(<EvaluateProgressDialog sessionId="session-1" onClose={vi.fn()} onGenerated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '开始评估' }))
    expect(await screen.findByText('证据不足')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始评估' })).toBeInTheDocument()
  })
})
