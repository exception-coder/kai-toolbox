import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import { Download, Maximize2 } from 'lucide-react'
import { MermaidLightbox } from '@/components/markdown/MermaidLightbox'
import { downloadSvg } from '@/components/markdown/downloadSvg'
import { cn } from '@/lib/utils'
import { openSessionLocalPath } from '../api'

// ── Mermaid 初始化（全局一次）──────────────────────────────────────────────────
// startOnLoad=false：由本组件按需触发，避免 mermaid 自动扫 DOM 与 React 冲突。
// securityLevel='loose' 允许在 SVG 内使用点击事件（flowchart 的交互节点）。
// 主题跟随 CSS 变量（CSS vars 由 ThemeMenu 动态切换），改在 config 注入。
let mermaidInitialized = false
function ensureMermaidInit() {
  if (mermaidInitialized) return
  mermaidInitialized = true
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'default',
    fontFamily: 'inherit',
  })
}

// ── MermaidDiagram ─────────────────────────────────────────────────────────────
// 独立组件：接收 mermaid 源码，异步渲染为 SVG 后注入。
// code 变化时重新渲染（流式输出期间代码在增量构建，完整后才能正常渲染）。
// idRef 保证每个实例用唯一 ID，避免 mermaid 内部缓存冲突。
function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const idRef = useRef(`mg-${Math.random().toString(36).slice(2, 9)}`)

  useEffect(() => {
    let alive = true
    setSvg(null)
    setErr(null)
    ensureMermaidInit()
    mermaid.render(idRef.current, code)
      .then(({ svg: s }) => { if (alive) setSvg(s) })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [code])

  if (err) {
    // 渲染失败：回退显示原始代码块，标注错误
    return (
      <div className="my-2 rounded-lg border border-rose-200 bg-rose-50 p-1 text-xs dark:border-rose-900 dark:bg-rose-950">
        <pre className="overflow-x-auto p-2 text-xs text-rose-700 dark:text-rose-300">{code}</pre>
        <p className="px-2 pb-1.5 text-[11px] text-rose-500 opacity-70">mermaid 渲染失败：{err}</p>
      </div>
    )
  }

  if (!svg) {
    // 渲染中：占位（避免布局抖动）
    return (
      <div className="my-2 flex items-center justify-center rounded-lg bg-[var(--color-muted)] py-6 text-xs text-[var(--color-muted-foreground)]">
        生成图表中…
      </div>
    )
  }

  return (
    <>
      <div className="group relative my-2 rounded-lg bg-[var(--color-background)]">
        <button
          type="button"
          onClick={() => downloadSvg(svg)}
          className="absolute right-12 top-2 z-10 flex size-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)]/90 text-[var(--color-muted-foreground)] shadow-sm backdrop-blur hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
          title="导出 SVG 矢量图"
          aria-label="导出 SVG 矢量图"
        >
          <Download className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)]/90 text-[var(--color-muted-foreground)] shadow-sm backdrop-blur hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
          title="全屏查看图表"
          aria-label="全屏查看 Mermaid 图表"
        >
          <Maximize2 className="size-4" />
        </button>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setLightboxOpen(true)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') setLightboxOpen(true)
          }}
          className="cursor-zoom-in overflow-x-auto p-2 pr-12 [&_svg]:max-w-full"
          // mermaid 返回的是清洁 SVG，无脚本，安全注入
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      {lightboxOpen && (
        <MermaidLightbox svgHtml={svg} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  )
}

// ── 文本分段：普通 markdown vs. mermaid 代码块 ────────────────────────────────
// 只有 ``` 块完整闭合（有结束 ```）时才切出 mermaid 段落，未闭合的（流式中）
// 当作普通代码块处理，等下一次 text 更新后再尝试。
type Segment = { kind: 'text'; content: string } | { kind: 'mermaid'; code: string }

function splitMermaid(text: string): Segment[] {
  const segs: Segment[] = []
  const re = /```mermaid\r?\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ kind: 'text', content: text.slice(last, m.index) })
    segs.push({ kind: 'mermaid', code: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) segs.push({ kind: 'text', content: text.slice(last) })
  return segs
}

// ── MarkdownPart：单段普通 markdown 渲染（保留原有实现）──────────────────────
function MarkdownPart({ text, className, sessionId }: { text: string; className?: string; sessionId?: string }) {
  const [localPathNotice, setLocalPathNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const html = useMemo(() => {
    if (!text.trim()) return null
    try {
      const raw = marked.parse(text, { async: false, gfm: true, breaks: true }) as string
      const rawDoc = new DOMParser().parseFromString(raw, 'text/html')
      rawDoc.querySelectorAll<HTMLAnchorElement>('a').forEach(anchor => {
        const localPath = localPathFromHref(anchor.getAttribute('href'))
        if (!localPath) return
        anchor.dataset.localPath = localPath
        anchor.href = '#'
        anchor.title = `打开本地路径：${localPath}`
      })
      const sanitized = DOMPurify.sanitize(rawDoc.body.innerHTML)
      const doc = new DOMParser().parseFromString(sanitized, 'text/html')
      doc.querySelectorAll<HTMLOListElement>('ol').forEach(list => {
        const items = Array.from(list.children) as HTMLLIElement[]
        let value = list.hasAttribute('start') ? list.start : list.reversed ? items.length : 1
        for (const item of items) {
          value = item.hasAttribute('value') ? item.value : value
          item.dataset.copyListMarker = `${value}.`
          value += list.reversed ? -1 : 1
        }
      })
      doc.querySelectorAll('pre').forEach(pre => {
        const button = doc.createElement('button')
        button.type = 'button'
        button.className = 'markdown-code-copy'
        button.dataset.codeCopy = 'true'
        button.setAttribute('aria-label', '复制代码')
        button.textContent = '复制'
        pre.appendChild(button)
      })
      return doc.body.innerHTML
    } catch {
      return null
    }
  }, [text])

  const handleClick = async (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const localLink = target.closest<HTMLAnchorElement>('a[data-local-path]')
    if (localLink) {
      event.preventDefault()
      const path = localLink.dataset.localPath
      if (!sessionId || !path) {
        setLocalPathNotice({ tone: 'error', text: '当前视图没有可用的会话，无法打开本地路径' })
        return
      }
      try {
        await openSessionLocalPath(sessionId, path)
        setLocalPathNotice({ tone: 'success', text: `已打开：${path}` })
      } catch (error) {
        setLocalPathNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
      }
      window.setTimeout(() => setLocalPathNotice(null), 2_500)
      return
    }
    const button = target.closest<HTMLButtonElement>('[data-code-copy="true"]')
    if (!button) return
    const code = button.closest('pre')?.querySelector('code')?.textContent ?? ''
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    button.textContent = '已复制'
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = '复制'
    }, 1200)
  }

  const copySelection = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null
    if (!range || !event.currentTarget.contains(range.commonAncestorContainer)) return
    const container = document.createElement('div')
    container.append(range.cloneContents())
    const listItems = container.querySelectorAll<HTMLElement>('li[data-copy-list-marker]')
    if (!listItems.length) return
    const richHtml = container.innerHTML.replace(/ data-copy-list-marker="[^"]*"/g, '')
    listItems.forEach(item => item.prepend(document.createTextNode(`${item.dataset.copyListMarker} `)))
    container.style.cssText = 'position:fixed;left:-10000px;top:0;white-space:pre-wrap'
    document.body.appendChild(container)
    const plainText = container.innerText
    container.remove()
    event.preventDefault()
    event.clipboardData.setData('text/plain', plainText)
    event.clipboardData.setData('text/html', richHtml)
  }

  if (html == null) {
    return <span className="whitespace-pre-wrap wrap-anywhere">{text}</span>
  }

  return (
    <>
      <div
        onClick={handleClick}
        onCopy={copySelection}
        className={cn(
        'appearance-reading-content markdown-body min-w-0 max-w-full wrap-anywhere text-sm leading-relaxed',
        '[&_h1]:my-3 [&_h1]:text-xl [&_h1]:font-semibold',
        '[&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold',
        '[&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold',
        '[&_h4]:my-2 [&_h4]:font-semibold',
        '[&_p]:my-2',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_pre]:relative [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--color-muted)] [&_pre]:p-3 [&_pre]:pt-9 [&_pre]:text-xs',
        '[&_.markdown-code-copy]:absolute [&_.markdown-code-copy]:right-2 [&_.markdown-code-copy]:top-2 [&_.markdown-code-copy]:rounded-md [&_.markdown-code-copy]:border [&_.markdown-code-copy]:border-[var(--color-border)] [&_.markdown-code-copy]:bg-[var(--color-background)]/90 [&_.markdown-code-copy]:px-2 [&_.markdown-code-copy]:py-1 [&_.markdown-code-copy]:text-[11px] [&_.markdown-code-copy]:text-[var(--color-muted-foreground)] [&_.markdown-code-copy]:shadow-sm [&_.markdown-code-copy]:hover:text-[var(--color-foreground)]',
        '[&_code]:font-mono [&_code]:text-[0.9em]',
        '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-[var(--color-muted)] [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:wrap-anywhere',
        '[&_a]:text-[var(--color-primary)] [&_a]:underline [&_a]:underline-offset-2',
        '[&_strong]:font-semibold',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border)] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[var(--color-muted-foreground)]',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border [&_th]:border-[var(--color-border)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-2 [&_td]:py-1',
        '[&_hr]:my-3 [&_hr]:border-[var(--color-border)]',
        '[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg',
        className,
      )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {localPathNotice && (
        <div className={cn('mt-1 text-[11px]', localPathNotice.tone === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-600 dark:text-red-400')}>
          {localPathNotice.text}
        </div>
      )}
    </>
  )
}

function localPathFromHref(href: string | null): string | null {
  if (!href) return null
  let value = href.trim()
  try { value = decodeURIComponent(value) } catch { /* 保留原值，由后端继续校验 */ }
  if (/^file:\/\//i.test(value)) {
    value = value.replace(/^file:\/\/\/?/i, '')
    if (!/^[a-z]:/i.test(value)) value = `/${value}`
  }
  return /^[a-z]:[\\/]/i.test(value) || /^\/(?!\/)/.test(value) || /^\.\.?[\\/]/.test(value)
    ? value
    : null
}

// ── Markdown（对外导出）────────────────────────────────────────────────────────
/**
 * 渲染 assistant 回复的 markdown，支持 mermaid 图表渲染。
 * - 普通 markdown：marked 解析 → DOMPurify 消毒 → 注入
 * - ```mermaid 块：提取后由 MermaidDiagram 异步渲染为 SVG
 * - 流式输出期间 mermaid 块未闭合时当普通代码块显示，闭合后自动升级为图表
 */
export function Markdown({ text, className, sessionId }: { text: string; className?: string; sessionId?: string }) {
  const segments = useMemo(() => splitMermaid(text ?? ''), [text])

  // 只有一段普通文本（最常见情况）：走原来最简路径，不引入额外 wrapper
  if (segments.length === 1 && segments[0].kind === 'text') {
    return <MarkdownPart text={segments[0].content} className={className} sessionId={sessionId} />
  }

  return (
    <div className={cn('min-w-0 max-w-full', className)}>
      {segments.map((seg, i) =>
        seg.kind === 'mermaid'
          ? <MermaidDiagram key={i} code={seg.code} />
          : <MarkdownPart key={i} text={seg.content} sessionId={sessionId} />
      )}
    </div>
  )
}
