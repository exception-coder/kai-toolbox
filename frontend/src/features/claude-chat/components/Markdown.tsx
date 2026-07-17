import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'

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
    <div
      className="my-2 overflow-x-auto rounded-lg bg-[var(--color-background)] p-2 [&_svg]:max-w-full"
      // mermaid 返回的是清洁 SVG，无脚本，安全注入
      dangerouslySetInnerHTML={{ __html: svg }}
    />
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
function MarkdownPart({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    if (!text.trim()) return null
    try {
      const raw = marked.parse(text, { async: false, gfm: true, breaks: true }) as string
      return DOMPurify.sanitize(raw)
    } catch {
      return null
    }
  }, [text])

  if (html == null) {
    return <span className="whitespace-pre-wrap wrap-anywhere">{text}</span>
  }

  return (
    <div
      className={cn(
        'markdown-body min-w-0 max-w-full wrap-anywhere text-sm leading-relaxed',
        '[&_h1]:my-3 [&_h1]:text-xl [&_h1]:font-semibold',
        '[&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold',
        '[&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold',
        '[&_h4]:my-2 [&_h4]:font-semibold',
        '[&_p]:my-2',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--color-muted)] [&_pre]:p-3 [&_pre]:text-xs',
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
  )
}

// ── Markdown（对外导出）────────────────────────────────────────────────────────
/**
 * 渲染 assistant 回复的 markdown，支持 mermaid 图表渲染。
 * - 普通 markdown：marked 解析 → DOMPurify 消毒 → 注入
 * - ```mermaid 块：提取后由 MermaidDiagram 异步渲染为 SVG
 * - 流式输出期间 mermaid 块未闭合时当普通代码块显示，闭合后自动升级为图表
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMermaid(text ?? ''), [text])

  // 只有一段普通文本（最常见情况）：走原来最简路径，不引入额外 wrapper
  if (segments.length === 1 && segments[0].kind === 'text') {
    return <MarkdownPart text={segments[0].content} className={className} />
  }

  return (
    <div className={cn('min-w-0 max-w-full', className)}>
      {segments.map((seg, i) =>
        seg.kind === 'mermaid'
          ? <MermaidDiagram key={i} code={seg.code} />
          : <MarkdownPart key={i} text={seg.content} />
      )}
    </div>
  )
}
