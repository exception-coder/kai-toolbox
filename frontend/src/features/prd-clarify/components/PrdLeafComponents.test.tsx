import { useRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevDocEstimation } from '../types'
import { DocOutline } from './DocOutline'
import { EstimationBadge } from './EstimationBadge'
import { StepBar } from './StepBar'

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

    fireEvent.click(screen.getByTitle('返回填写需求'))
    fireEvent.click(screen.getByTitle('查看AI 渐进澄清'))

    expect(onClickStep).toHaveBeenNthCalledWith(1, 0)
    expect(onClickStep).toHaveBeenNthCalledWith(2, 1)
    expect(screen.getAllByRole('button')[2]).toBeDisabled()
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
})
