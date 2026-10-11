import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderMarkdownToHtml } from '../lib/renderMarkdown'
import { RenderedMarkdownRoot } from './RenderedMarkdownRoot'
import { TocPanel, type TocEntry } from './TocPanel'

afterEach(cleanup)

function Fixture({ html, onEntriesChange }: {
  html: string
  onEntriesChange?: (entries: TocEntry[]) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  return (
    <>
      <RenderedMarkdownRoot html={html} className="doc-viewer-md" rootRef={rootRef} />
      <TocPanel rootRef={rootRef} contentKey="fixture" onEntriesChange={onEntriesChange} />
    </>
  )
}

describe('TocPanel', () => {
  it('显示深层章节并定位正文，保留二三级章节原有的备注锚点', () => {
    const html = renderMarkdownToHtml([
      '# 文档标题',
      '## 3. Controller 与接口规范',
      '### 3.3 基础接口契约对象与用法',
      '#### 3.3.1 普通对象与集合响应',
      '##### 3.3.1.1 返回对象',
      '###### 3.3.1.1.1 响应字段',
      '## 4. 对象定义与转换',
      '```markdown',
      '#### 代码示例中的标题',
      '```',
    ].join('\n\n'), { rawBaseUrl: '/raw/', sourceId: 'fixture', currentDir: '' })
    const onEntriesChange = vi.fn()
    const { container } = render(<Fixture html={html} onEntriesChange={onEntriesChange} />)
    const entries = onEntriesChange.mock.lastCall![0] as TocEntry[]

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      '3. Controller 与接口规范',
      '3.3 基础接口契约对象与用法',
      '3.3.1 普通对象与集合响应',
      '3.3.1.1 返回对象',
      '3.3.1.1.1 响应字段',
      '4. 对象定义与转换',
    ])
    expect(entries.map(entry => entry.level)).toEqual([2, 3, 4, 5, 6, 2])
    expect(entries[0].id).toBe('doc-toc-0-3.-Controller-与接口规范')
    expect(entries[1].id).toBe('doc-toc-1-3.3-基础接口契约对象与用法')
    expect(entries[5].id).toBe('doc-toc-2-4.-对象定义与转换')

    const nestedLink = screen.getByRole('link', { name: '3.3.1 普通对象与集合响应' })
    expect(nestedLink).toHaveStyle({ paddingLeft: '32px' })
    expect(screen.getByRole('link', { name: '3.3.1.1.1 响应字段' }))
      .toHaveStyle({ paddingLeft: '56px' })
    const nestedHeading = container.querySelector('h4')!
    const scrollIntoView = vi.fn()
    nestedHeading.scrollIntoView = scrollIntoView

    fireEvent.click(nestedLink)
    expect(nestedLink).toHaveAttribute('href', `#${nestedHeading.id}`)
    expect(nestedLink).toHaveAttribute('aria-current', 'location')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('异步渲染只有深层标题的内容时更新大纲，沿用显式锚点并清除已移除章节', async () => {
    const onEntriesChange = vi.fn()
    const { rerender } = render(<Fixture html="" onEntriesChange={onEntriesChange} />)
    expect(screen.getByText('本文无章节标题')).toBeInTheDocument()

    rerender(<Fixture
      html='<section><h4 id="response-details">3.3.1 普通对象与集合响应</h4></section>'
      onEntriesChange={onEntriesChange}
    />)
    const link = await screen.findByRole('link', { name: '3.3.1 普通对象与集合响应' })
    expect(link).toHaveAttribute('href', '#response-details')
    expect(onEntriesChange.mock.lastCall![0]).toEqual([
      { id: 'response-details', level: 4, text: '3.3.1 普通对象与集合响应' },
    ])

    rerender(<Fixture html="<p>本文暂无章节</p>" onEntriesChange={onEntriesChange} />)
    await waitFor(() => expect(screen.getByText('本文无章节标题')).toBeInTheDocument())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(onEntriesChange.mock.lastCall![0]).toEqual([])
  })
})
