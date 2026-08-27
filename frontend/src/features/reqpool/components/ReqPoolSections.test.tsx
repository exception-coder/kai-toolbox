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

  it('附件只展示索引入口而不展开解析后的全文', () => {
    render(<RequirementDescription content={'请按附件完成需求理解。\n\n[📎 附件：新品进度管理-current.md](/api/prd-clarify/attachments/file/doc-1)\n---\n【附件：新品进度管理-current.md】\n# 新品进度管理初始化规格说明书\n\n大量附件正文\n---'} />)

    expect(screen.getByText('请按附件完成需求理解。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看附件' })).toHaveAttribute('href', '/api/prd-clarify/attachments/file/doc-1')
    expect(screen.queryByText('新品进度管理初始化规格说明书')).not.toBeInTheDocument()
    expect(screen.queryByText('大量附件正文')).not.toBeInTheDocument()
  })

  it('旧附件缺少下载地址时仍隐藏解析全文', () => {
    render(<RequirementDescription content={'根据 Word 说明完善需求\n---\n【附件：纱线在线报价系统.docx】\n旧附件解析正文'} />)

    expect(screen.getByText('根据 Word 说明完善需求')).toBeInTheDocument()
    expect(screen.getByText('纱线在线报价系统.docx')).toBeInTheDocument()
    expect(screen.getByText('原附件')).toBeInTheDocument()
    expect(screen.queryByText('旧附件解析正文')).not.toBeInTheDocument()
  })
})
