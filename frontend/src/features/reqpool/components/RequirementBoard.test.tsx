import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReqItemView } from '../types'
import { RequirementBoard, selectMissionFocus } from './RequirementBoard'

function item(id: string, status: ReqItemView['status']): ReqItemView {
  return { id, status, title: id, createdAt: 1, updatedAt: 1 } as ReqItemView
}

describe('RequirementBoard', () => {
  it('uses mission control for a sparse workload without empty columns', () => {
    render(
      <RequirementBoard
        items={[item('待澄清需求', 'CLARIFYING'), item('交付完成需求', 'DONE')]}
        density="comfortable"
        allSelected={false}
        selectAllRef={createRef<HTMLInputElement>()}
        onToggleAll={vi.fn()}
        renderNote={requirement => <div>{requirement.title}</div>}
        renderLineage={() => null}
      />,
    )

    expect(screen.getByRole('region', { name: 'AI 任务指挥台' })).toBeInTheDocument()
    expect(screen.queryByText('当前阶段暂无需求')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '当前焦点' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI 执行动态' })).toBeInTheDocument()
    expect(screen.getByText('待澄清需求')).toBeInTheDocument()
    expect(screen.getByText('交付完成需求')).toBeInTheDocument()
  })

  it('keeps the complete kanban when workload exceeds five items', () => {
    render(<RequirementBoard items={[
      item('a', 'DRAFT'), item('b', 'CLARIFYING'), item('c', 'PRD_READY'),
      item('d', 'IN_DEV'), item('e', 'DONE'), item('f', 'CANCELLED'),
    ]} density="compact" allSelected={false} selectAllRef={createRef<HTMLInputElement>()}
      onToggleAll={vi.fn()} renderNote={requirement => <div>{requirement.title}</div>} renderLineage={() => null} />)

    expect(screen.getByRole('region', { name: '需求生命周期看板' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '执行中' })).toBeInTheDocument()
  })

  it('selects active delivery work as focus before completed work', () => {
    const completed = { ...item('done', 'DONE'), updatedAt: 99 }
    const active = { ...item('active', 'IN_DEV'), updatedAt: 1 }
    expect(selectMissionFocus([completed, active])?.id).toBe('active')
  })
})
