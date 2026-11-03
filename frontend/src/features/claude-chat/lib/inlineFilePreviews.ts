import { inlinePagePreviewEntryFromHref } from '@/features/browser-request/public-api/page-preview'

export type InlineFileKind = 'markdown' | 'sql' | 'diagram'
export interface InlineFileReference { kind: InlineFileKind; path: string; label: string }
export interface InlinePageReference { path: string; label: string }
export interface InlineFileBlock { html: string; files: InlineFileReference[]; pages: InlinePageReference[] }

/** Split sanitized top-level HTML, retaining full Markdown parsing and stable React positions. */
export function inlineFileBlocks(html: string, options = { files: true, pages: false }): InlineFileBlock[] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const seen = new Set<string>()
  let hasFiles = false
  const pages: InlinePageReference[] = []
  let pageBlock: InlineFileBlock | undefined
  const blocks = Array.from(doc.body.childNodes).map(node => {
    const files: InlineFileReference[] = []
    if (node instanceof Element) {
      const anchors = [...(node.matches('a') ? [node] : []), ...node.querySelectorAll('a')]
      for (const anchor of anchors) {
        if (anchor.closest('pre,code')) continue
        const element = anchor as HTMLAnchorElement
        const page = options.pages ? inlinePagePreviewEntryFromHref(element.getAttribute('href')) : null
        if (page && !seen.has(`page:${page}`)) {
          seen.add(`page:${page}`)
          pages.push({ path: page, label: element.textContent?.trim() || '页面预览' })
        }
        if (!options.files) continue
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
    const block: InlineFileBlock = { html: wrapper.innerHTML, files, pages: [] }
    if (pages.length && !pageBlock) pageBlock = block
    return block
  })
  if (pageBlock) pageBlock.pages = pages
  return hasFiles || pages.length ? blocks : null
}
