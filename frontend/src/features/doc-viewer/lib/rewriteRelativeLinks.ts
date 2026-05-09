/**
 * 把 markdown 渲染产物中的相对 URL 重写到正确目标：
 * - 相对图片 / 资源 → 指向 raw URL
 * - 相对 .md / .markdown 链接 → 应用内路由 /tools/doc-viewer/{sourceId}/{path}
 * - 已是 http(s):// / data: / # 锚点的 URL 不动
 *
 * 输入是经过 marked 渲染、dompurify sanitize 之后的 HTML 字符串。
 * 用 DOMParser 解析、改写、序列化，避免正则误伤。
 */
export interface RewriteContext {
  rawBaseUrl: string
  sourceId: string
  /** 当前文件相对于 source 根的目录（不含末尾 /），如 'design/sub' 或 '' */
  currentDir: string
}

export function rewriteRelativeLinks(html: string, ctx: RewriteContext): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return html

  root.querySelectorAll('img[src]').forEach(el => {
    const src = el.getAttribute('src')
    if (!src) return
    if (isAbsolute(src) || src.startsWith('#') || src.startsWith('data:')) return
    el.setAttribute('src', joinRaw(ctx, src))
  })
  root.querySelectorAll('a[href]').forEach(el => {
    const href = el.getAttribute('href')
    if (!href) return
    if (isAbsolute(href) || href.startsWith('#') || href.startsWith('mailto:')) return
    if (isMarkdownPath(href)) {
      el.setAttribute('href', joinAppRoute(ctx, href))
      el.removeAttribute('target')
    } else {
      el.setAttribute('href', joinRaw(ctx, href))
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return root.innerHTML
}

function isAbsolute(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith('//')
}

function isMarkdownPath(url: string): boolean {
  const stripped = url.split('#')[0].split('?')[0].toLowerCase()
  return stripped.endsWith('.md') || stripped.endsWith('.markdown') || stripped.endsWith('.mdx')
}

function resolveRel(currentDir: string, rel: string): string {
  const cleaned = rel.replace(/^\.\/+/, '')
  if (!currentDir) return cleaned
  // 处理 ../
  const segs = (currentDir + '/' + cleaned).split('/').filter(Boolean)
  const stack: string[] = []
  for (const s of segs) {
    if (s === '.') continue
    if (s === '..') {
      stack.pop()
      continue
    }
    stack.push(s)
  }
  return stack.join('/')
}

function joinRaw(ctx: RewriteContext, rel: string): string {
  const resolved = resolveRel(ctx.currentDir, rel)
  // rawBaseUrl 已带末尾 /
  return ctx.rawBaseUrl + resolved
}

function joinAppRoute(ctx: RewriteContext, rel: string): string {
  const [pathPart, ...rest] = rel.split('#')
  const resolved = resolveRel(ctx.currentDir, pathPart)
  const hash = rest.length ? '#' + rest.join('#') : ''
  return `/tools/doc-viewer/${encodeURIComponent(ctx.sourceId)}/${resolved
    .split('/')
    .map(encodeURIComponent)
    .join('/')}${hash}`
}
