import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Copy, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { HttpCallStreamView, HttpCallView } from '../types'

/** 简短的 method 徽章颜色。 */
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  POST: 'bg-green-500/20 text-green-700 dark:text-green-300',
  PUT: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  PATCH: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  DELETE: 'bg-red-500/20 text-red-700 dark:text-red-300',
  HEAD: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
}

type AnyCall = HttpCallStreamView | HttpCallView

interface Props {
  call: AnyCall
  /** 完整 detail 时可展开 body/headers 查看；流视图无 body 只能展开看 url/seq */
  expanded?: boolean
  onToggle?: () => void
  /** 编排页可勾选；undefined 时不显示复选框 */
  selected?: boolean
  onSelect?: (next: boolean) => void
  /** 命中搜索：卡片描边 + 响应体内关键字高亮 */
  highlight?: boolean
  /** 用于响应体内文本片段高亮（仅在 highlight=true 且关键字非空时生效） */
  searchKeyword?: string
}

export function HttpCallCard({ call, expanded, onToggle, selected, onSelect, highlight, searchKeyword }: Props) {
  const [open, setOpen] = useState(expanded ?? false)
  // 命中搜索时默认展开响应体方便查看上下文
  const isExpanded = expanded ?? (open || !!highlight)
  const toggle = onToggle ?? (() => setOpen(o => !o))

  const detail = 'requestHeaders' in call ? (call as HttpCallView) : null
  const status = call.status ?? null
  const statusVariant: 'default' | 'secondary' | 'destructive' = status == null
    ? 'secondary'
    : status >= 200 && status < 300
      ? 'default'
      : status >= 400
        ? 'destructive'
        : 'secondary'

  return (
    <div
      className={`rounded-md border bg-[var(--color-card)] text-sm transition-colors ${
        highlight ? 'border-amber-500 ring-1 ring-amber-400/60 dark:border-amber-400' : ''
      }`}
    >
      <div className="flex items-center gap-2 p-2">
        {onSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={e => onSelect(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
        )}
        <button onClick={toggle} className="text-[var(--color-muted-foreground)]">
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <span className="w-10 shrink-0 text-right text-[10px] text-[var(--color-muted-foreground)]">
          #{call.seq}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${METHOD_COLORS[call.method] ?? 'bg-gray-500/20'}`}>
          {call.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={call.url}>
          {call.url}
        </span>
        {call.sensitive && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" title="敏感字段：body 已被过滤">
            <Lock className="size-3" /> 敏感
          </span>
        )}
        {status != null && (
          <Badge variant={statusVariant} className="shrink-0">
            {status}
          </Badge>
        )}
        <span className="w-12 shrink-0 text-right text-[10px] text-[var(--color-muted-foreground)]">
          {call.resourceType}
        </span>
      </div>
      {isExpanded && (
        <div className="space-y-2 border-t p-2 text-xs">
          <div className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
            seq {call.seq} · {new Date(call.startedAt).toLocaleTimeString()}
            {call.elapsedMs != null && ` · ${call.elapsedMs}ms`}
          </div>
          {detail && (
            <>
              {detail.requestHeaders && Object.keys(detail.requestHeaders).length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[10px] text-[var(--color-muted-foreground)]">
                    请求头（{Object.keys(detail.requestHeaders).length}）
                  </summary>
                  <pre className="overflow-auto rounded bg-[var(--color-muted)] p-1 font-mono text-[10px]">
                    {JSON.stringify(detail.requestHeaders, null, 2)}
                  </pre>
                </details>
              )}
              {detail.requestBody && (
                <details>
                  <summary className="cursor-pointer text-[10px] text-[var(--color-muted-foreground)]">
                    请求体（{detail.requestBody.length} 字符）
                  </summary>
                  <pre className="max-h-40 overflow-auto rounded bg-[var(--color-muted)] p-1 font-mono text-[10px]">
                    {detail.requestBody}
                  </pre>
                </details>
              )}
              {detail.responseBody && (
                <details open>
                  <summary className="flex cursor-pointer items-center gap-2 text-[10px] text-[var(--color-muted-foreground)]">
                    <span>响应体（{detail.responseBody.length} 字符）{detail.responseTruncated && '· 已截断'}</span>
                    <CopyButton text={detail.responseBody} />
                  </summary>
                  <pre className="max-h-60 overflow-auto rounded bg-[var(--color-muted)] p-1 font-mono text-[10px]">
                    {highlight && searchKeyword
                      ? renderWithHighlight(detail.responseBody, searchKeyword)
                      : detail.responseBody}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 响应体旁的一键复制按钮，独立 state 防止重复 setState 影响外层。 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async (e: ReactMouseEvent) => {
    // 阻止冒泡到 <summary>，避免点了复制反而把响应体折叠起来
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* 用户拒绝剪贴板权限时静默失败 */
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
      title="复制响应体到剪贴板"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

/** 把 body 按关键字分段，命中的片段套 mark 高亮。大小写不敏感。 */
function renderWithHighlight(body: string, kw: string): ReactNode {
  if (!kw) return body
  const lower = body.toLowerCase()
  const kwLower = kw.toLowerCase()
  const parts: ReactNode[] = []
  let i = 0
  let hit = lower.indexOf(kwLower, i)
  let n = 0
  while (hit >= 0) {
    if (hit > i) parts.push(body.slice(i, hit))
    parts.push(
      <mark key={n++} className="bg-amber-300/70 text-current dark:bg-amber-500/50">
        {body.slice(hit, hit + kw.length)}
      </mark>,
    )
    i = hit + kw.length
    hit = lower.indexOf(kwLower, i)
  }
  if (i < body.length) parts.push(body.slice(i))
  return parts
}
