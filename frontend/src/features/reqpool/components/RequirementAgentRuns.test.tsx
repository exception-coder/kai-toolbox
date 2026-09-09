import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import { RequirementAgentRuns } from './RequirementAgentRuns'

describe('RequirementAgentRuns', () => {
  it('keeps asynchronous status readable and announced on narrow layouts', () => {
    const session = {
      id: 'prd-1',
      engine: 'claude',
      status: 'DISCOVERING',
      progressWorkStatus: null,
      updatedAt: 1,
    } as PrdSessionView

    render(<RequirementAgentRuns session={session} />)

    const region = screen.getByRole('region', { name: 'Agent 运行状态' })
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('需求规格分析 Agent').parentElement).toHaveClass('flex-col', 'sm:flex-row')
    expect(screen.getByText('执行中 · Claude Code')).toHaveClass('text-[11px]', 'sm:shrink-0')
    expect(screen.getByText(/后台运行中，无需重复执行/)).toHaveClass('break-words')
  })
})
