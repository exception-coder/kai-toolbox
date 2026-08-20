/**
 * Mermaid 懒加载 + 把 Markdown 中的 Mermaid 占位节点渲染为 SVG。
 * 依赖在使用此函数的页面才下载，避免污染首屏体积。
 */
let initPromise: Promise<typeof import('mermaid').default> | null = null

async function getMermaid() {
  if (!initPromise) {
    initPromise = import('mermaid').then(m => {
      m.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
      })
      return m.default
    })
  }
  return initPromise
}

export async function replaceMermaidBlocks(root: HTMLElement) {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('.doc-viewer-mermaid-pending'),
  )
  if (blocks.length === 0) return
  for (const block of blocks) {
    const code = block.textContent ?? ''
    try {
      const mermaid = await getMermaid()
      await mermaid.parse(code)
      block.className = 'mermaid'
      block.textContent = code
      await mermaid.run({ nodes: [block], suppressErrors: true })
      if (!block.querySelector('svg')) throw new Error('未生成图表')
      block.className = 'doc-viewer-mermaid'
      block.removeAttribute('data-processed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const err = document.createElement('pre')
      err.className = 'doc-viewer-mermaid-error'
      err.textContent = `mermaid 渲染失败：${msg}\n\n${code}`
      block.replaceWith(err)
    }
  }
}
