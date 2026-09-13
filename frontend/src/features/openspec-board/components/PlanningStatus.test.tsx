import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PlanningStatus } from './PlanningStatus'

afterEach(cleanup)

it('preserves custom artifacts and prerequisite gaps from the official result', () => {
  render(<PlanningStatus workflow={{ state: 'blocked', missingArtifacts: ['tasks'], missingPrerequisites: ['design'], artifacts: [{ id: 'custom-review', status: 'blocked', missingDeps: ['design'] }] }} />)
  expect(screen.getByText('custom-review')).toBeInTheDocument()
  expect(screen.getByText('实施前还需补充：任务清单、技术设计')).toBeInTheDocument()
  expect(screen.getByText(/不代表构建、测试或运行验收通过/)).toBeInTheDocument()
})

it('does not claim readiness when an older server omits planning state', () => {
  render(<PlanningStatus workflow={undefined} />)
  expect(screen.getByText(/查询尚未返回材料状态/)).toBeInTheDocument()
})
