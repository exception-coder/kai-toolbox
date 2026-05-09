/**
 * mermaid 懒加载 + 把渲染产物中的 <pre><code class="language-mermaid"> 替换为 SVG。
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

let nodeId = 0

export async function replaceMermaidBlocks(root: HTMLElement) {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('.doc-viewer-mermaid-pending'),
  )
  if (blocks.length === 0) return
  const mermaid = await getMermaid()
  for (const block of blocks) {
    const code = block.textContent ?? ''
    const id = `mermaid-svg-${++nodeId}`
    try {
      const { svg } = await mermaid.render(id, code)
      const wrapper = document.createElement('div')
      wrapper.className = 'doc-viewer-mermaid'
      wrapper.innerHTML = svg
      block.replaceWith(wrapper)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const err = document.createElement('pre')
      err.className = 'doc-viewer-mermaid-error'
      err.textContent = `mermaid 渲染失败：${msg}\n\n${code}`
      block.replaceWith(err)
    }
  }
}
