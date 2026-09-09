import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReqItemView } from '../types'
import { RequirementBoard } from './RequirementBoard'

function item(id: string, status: ReqItemView['status']): ReqItemView {
  return { id, status, title: id, createdAt: 1, updatedAt: 1 } as ReqItemView
}

describe('RequirementBoard', () => {
  it('renders the complete lifecycle and places notes in their stage', () => {
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

    expect(screen.getByRole('region', { name: '需求生命周期看板' })).toBeInTheDocument()
    expect(screen.getAllByText('当前阶段暂无需求')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: '澄清中' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '已交付' })).toBeInTheDocument()
    expect(screen.getByText('待澄清需求')).toBeInTheDocument()
    expect(screen.getByText('交付完成需求')).toBeInTheDocument()
  })
})
