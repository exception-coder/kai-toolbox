import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RequirementDescription } from './ReqPoolSections'

describe('RequirementDescription', () => {
  it('将只有核心规格时的需求描述渲染为 Markdown', () => {
    const { container } = render(
      <RequirementDescription content={'### 里程碑与取数口径\n\n1. 下单确认时间\n2. 终点织造完成时间'} />,
    )

    expect(screen.getByRole('heading', { level: 3, name: '里程碑与取数口径' })).toBeInTheDocument()
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
    expect(screen.queryByText('### 里程碑与取数口径')).not.toBeInTheDocument()
  })

  it('无描述时保留可理解的空状态', () => {
    render(<RequirementDescription content={null} />)

    expect(screen.getByText('尚未补充需求描述。')).toBeInTheDocument()
  })
})
