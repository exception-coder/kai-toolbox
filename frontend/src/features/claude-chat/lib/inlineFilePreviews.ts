export type InlineFileKind = 'markdown' | 'sql' | 'diagram'
export interface InlineFileReference { kind: InlineFileKind; path: string; label: string }
export interface InlineFileBlock { html: string; files: InlineFileReference[] }

/** Split sanitized top-level HTML, retaining full Markdown parsing and stable React positions. */
export function inlineFileBlocks(html: string): InlineFileBlock[] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const seen = new Set<string>()
  let hasFiles = false
  const blocks = Array.from(doc.body.childNodes).map(node => {
    const files: InlineFileReference[] = []
    if (node instanceof Element) {
      const anchors = [...(node.matches('a') ? [node] : []), ...node.querySelectorAll('a')]
      for (const anchor of anchors) {
        if (anchor.closest('pre,code')) continue
        const element = anchor as HTMLAnchorElement
        const kind: InlineFileKind | undefined = element.dataset.diagramPath ? 'diagram'
          : element.dataset.markdownPath ? 'markdown' : element.dataset.sqlPath ? 'sql' : undefined
        const path = element.dataset.diagramPath || element.dataset.markdownPath || element.dataset.sqlPath
        if (!kind || !path) continue
        const key = `${kind}:${path.replace(/\\/g, '/')}`
        if (seen.has(key)) continue
        seen.add(key)
        hasFiles = true
        files.push({ kind, path, label: element.textContent?.trim() || path.replace(/\\/g, '/').split('/').pop() || path })
      }
    }
    const wrapper = doc.createElement('div')
    wrapper.appendChild(node.cloneNode(true))
    return { html: wrapper.innerHTML, files }
  })
  return hasFiles ? blocks : null
}
