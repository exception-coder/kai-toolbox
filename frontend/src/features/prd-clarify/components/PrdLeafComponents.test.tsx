import { useRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DevDocEstimation } from '../types'
import { getBusinessFieldEntries } from '../lib/sessionPresentation'
import { DocOutline } from './DocOutline'
import { EstimationBadge } from './EstimationBadge'
import { RawInputCard } from './RawInputCard'
import { StepBar } from './StepBar'
import { StartClarifyDialog } from './dialogs/StartClarifyDialog'
import { DevDocUpdateDialog } from './dialogs/DevDocUpdateDialog'
import { DiscoveryPanel, RevisionPreparingPanel } from './panels/DiscoveryPanel'
import { GeneratingPanel } from './panels/GenerationPanels'
import { InputPanel } from './panels/InputPanel'

afterEach(cleanup)

const completedEstimation: DevDocEstimation = {
  hoursMin: 6,
  hoursMax: 10,
  confidence: 'HIGH',
  reasoning: '',
  breakdown: [],
  inspectedFiles: [],
  codeEvidenceSummary: '',
  assumptions: [],
  risks: [],
  engine: '',
  projectPath: '',
  codeInspected: false,
  sourceSessionId: 'session-1',
  sourceTitle: '测试需求',
  workStatus: 'COMPLETED',
  workError: '',
  startedAt: 0,
  completedAt: 1,
  estimatedAt: 1,
  stale: false,
  staleReasons: [],
}

function OutlineFixture() {
  const targetRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <DocOutline content={'# 总览\n## 范围\n##### 忽略'} targetRef={targetRef} />
      <div ref={targetRef}>
        <h1>总览</h1>
        <h2>范围</h2>
      </div>
    </>
  )
}

describe('PRD 叶子展示组件', () => {
  it('DocOutline 只解析一到四级标题，并定位预览中的同名标题', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<OutlineFixture />)

    expect(screen.getByRole('button', { name: '总览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '范围' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '忽略' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '范围' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('StepBar 只允许返回已完成的步骤', () => {
    const onClickStep = vi.fn()
    render(<StepBar step="EDITING" onClickStep={onClickStep} />)

    fireEvent.click(screen.getByTitle('返回需求输入'))
    fireEvent.click(screen.getByTitle('查看探索'))

    expect(onClickStep).toHaveBeenNthCalledWith(1, 0)
    expect(onClickStep).toHaveBeenNthCalledWith(2, 1)
    expect(screen.queryByText('缺口澄清')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')[2]).toBeDisabled()
  })

  it('开始探索不再要求选择回复式澄清深度和方式', () => {
    const onConfirm = vi.fn()
    render(
      <StartClarifyDialog
        showEngineToggle
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText('澄清深度（已按类型预填，可调整）')).not.toBeInTheDocument()
    expect(screen.queryByText('渐进式')).not.toBeInTheDocument()
    expect(screen.queryByText('批量')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开始探索' }))
    expect(onConfirm).toHaveBeenCalledWith('NEW_MODULE', undefined, 'progressive', 'claude')
  })

  it('开始探索首次点击后立即锁定，连续点击只提交一次', () => {
    const onStart = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <InputPanel onStart={onStart} />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByLabelText('描述想探索的问题或想法'), { target: { value: '验证规格探索幂等' } })
    const start = screen.getByRole('button', { name: '开始探索' })
    fireEvent.click(start)
    fireEvent.click(start)

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '正在创建探索…' })).toBeDisabled()
  })

  it('探索失败只提供后台重试和修改想法，不恢复回复式澄清', () => {
    const onRetry = vi.fn()
    const onBack = vi.fn()
    render(
      <DiscoveryPanel
        run={{
          id: 'run-1',
          sessionId: 'session-1',
          status: 'FAILED',
          stage: 'FAILED',
          progress: 100,
          attempt: 3,
          maxAttempts: 3,
          criteriaVersion: 'initial-spec-quality-v1',
          promptVersion: 'initial-spec-discovery-v2',
          vibeSessionId: 'vibe-session-1',
          traceId: 'trace-1',
          validationJson: JSON.stringify({ gaps: ['缺少验收场景'] }),
          lastError: '三次执行仍未通过检查',
          startedAt: 1,
          completedAt: 2,
          updatedAt: 2,
        }}
        starting={false}
        failed
        error="三次执行仍未通过检查"
        onRetry={onRetry}
        onBack={onBack}
      />,
    )

    expect(screen.getByText('本次探索未形成初始化规格')).toBeInTheDocument()
    expect(screen.getByText(/需要需求方判定的内容会写入初始化规格/)).toBeInTheDocument()
    expect(screen.queryByText(/AI 渐进澄清/)).not.toBeInTheDocument()
    expect(screen.queryByText(/生成精准澄清问题/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新后台探索' }))
    fireEvent.click(screen.getByRole('button', { name: '返回想法修改' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('修订准备态直接说明生成初始化规格而非逐题提问', () => {
    render(<RevisionPreparingPanel engine="codex" stage="creating" />)

    expect(screen.getByText('正在准备重新探索')).toBeInTheDocument()
    expect(screen.getByText('后台探索并生成新的初始化规格')).toBeInTheDocument()
    expect(screen.getByText(/不会逐题追问/)).toBeInTheDocument()
    expect(screen.queryByText(/首个澄清问题/)).not.toBeInTheDocument()
  })

  it('核心规格生成中实时渲染 Markdown 而不是显示原始标记', () => {
    const { container } = render(
      <GeneratingPanel
        streamText={'## 范围与边界\n\n- `REQ-001`：支持批量处理'}
        failed={false}
        onRetry={vi.fn()}
        engine="codex"
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: '范围与边界' })).toBeInTheDocument()
    expect(container.querySelector('li code')).toHaveTextContent('REQ-001')
    expect(container).not.toHaveTextContent('## 范围与边界')
  })

  it('规格到执行计划直接后台生成，不进入 TDD 逐题澄清', () => {
    const onConfirm = vi.fn()
    render(
      <DevDocUpdateDialog
        mode="initial"
        initialEngine="codex"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('生成执行计划')).toBeInTheDocument()
    expect(screen.getByText(/写入文档的“待确认技术事项”/)).toBeInTheDocument()
    expect(screen.queryByText(/TDD 技术澄清/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 \/ 5 题/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '后台生成执行计划' }))
    expect(onConfirm).toHaveBeenCalledWith('', [], 'codex')
  })

  it('EstimationBadge 区分完成、运行、失败和过期状态', () => {
    const { rerender } = render(<EstimationBadge estimation={completedEstimation} />)
    expect(screen.getByRole('button', { name: '6-10h' })).toHaveAttribute('title', 'AI 工时评估 · 信心：高')

    rerender(
      <EstimationBadge estimation={{ ...completedEstimation, workStatus: 'RUNNING' }} />,
    )
    expect(screen.getByRole('button', { name: '评估中' })).toHaveAttribute('title', 'AI 工时正在后台评估')

    rerender(
      <EstimationBadge estimation={{ ...completedEstimation, workStatus: 'ERROR', workError: '模型不可用' }} />,
    )
    expect(screen.getByRole('button', { name: '评估失败' })).toHaveAttribute('title', '模型不可用')

    rerender(
      <EstimationBadge estimation={{ ...completedEstimation, stale: true }} />,
    )
    expect(screen.getByRole('button', { name: '6-10h ⚠' })).toHaveAttribute(
      'title',
      '开发文档已更新，此评估可能已过期，建议重新评估',
    )
  })

  it('原始需求展示规则会过滤空白业务字段并保留宽字段', () => {
    expect(getBusinessFieldEntries({
      requester: '  张三  ',
      initiatingDepartment: '   ',
      requirementDetail: '支持批量审批',
    })).toEqual([
      { label: '提出人', value: '张三', wide: false },
      { label: '需求详情', value: '支持批量审批', wide: true },
    ])
  })

  it('RawInputCard 安全渲染 Markdown，并可关闭弹窗', () => {
    const onClose = vi.fn()
    const { container } = render(
      <RawInputCard
        session={{
          title: '批量审批',
          project: 'kai-toolbox',
          module: '需求池',
          role: 'BUSINESS',
          status: 'DONE',
          rawInput: '**加粗需求**<img src="x" onerror="alert(1)">',
          businessFields: { requester: '张三' },
          createdAt: 0,
        }}
        requirementType={{
          label: '模块调整',
          color: 'text-amber-500',
          bg: 'bg-amber-500/10',
        }}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('dialog', { name: '批量审批' })).toBeInTheDocument()
    expect(screen.getByText('加粗需求').tagName).toBe('STRONG')
    expect(container.querySelector('img')).not.toHaveAttribute('onerror')
    fireEvent.click(screen.getByRole('button', { name: '关闭原始需求' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
