import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRef, useState } from 'react'
import { RenderedMarkdownRoot } from './RenderedMarkdownRoot'

afterEach(cleanup)

function Fixture() {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  return (
    <>
      <RenderedMarkdownRoot
        html="<div class='doc-viewer-mermaid-pending'>graph TD</div>"
        className="doc-viewer-md"
        rootRef={rootRef}
      />
      <button type="button" onClick={() => setLightboxOpen(current => !current)}>
        {lightboxOpen ? '关闭' : '打开'}
      </button>
    </>
  )
}

describe('RenderedMarkdownRoot', () => {
  it('弹框状态变化时保留 Mermaid 原地生成的 SVG', () => {
    const { container } = render(<Fixture />)
    const mermaidRoot = container.querySelector('.doc-viewer-mermaid-pending')
    expect(mermaidRoot).not.toBeNull()

    mermaidRoot!.className = 'doc-viewer-mermaid'
    mermaidRoot!.innerHTML = '<svg aria-label="总体关系"></svg>'

    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(container.querySelector('.doc-viewer-mermaid svg')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(container.querySelector('.doc-viewer-mermaid svg')).not.toBeNull()
    expect(container.querySelector('.doc-viewer-mermaid-pending')).toBeNull()
  })
})
