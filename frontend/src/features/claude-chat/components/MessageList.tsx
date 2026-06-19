import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, FileImage, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadState as loadCardState, saveState as saveCardState } from '@/features/markdown-card/lib/persistence'
import type { ChatItem } from '../types'
import { ToolCallBubble } from './ToolCallBubble'
import { Markdown } from './Markdown'

interface Props {
  items: ChatItem[]
  running: boolean
  /** 滚到顶部触发加载更早一页 */
  onLoadEarlier?: () => void
  /** 正在加载更早 */
  loadingEarlier?: boolean
  /** 已无更早历史 */
  exhausted?: boolean
  /** 从某条用户消息分叉新会话（仅当该消息带 sdkUuid 时可用） */
  onFork?: (sdkUuid: string) => void
  /** 引擎展示名（Claude / Codex），用于「正在思考」文案 */
  engineLabel?: string
}

/** 消息流：用户气泡靠右、assistant 文本靠左、工具调用与系统标记居中。顶部上拉加载更早历史。 */
export function MessageList({ items, running, onLoadEarlier, loadingEarlier, exhausted, onFork, engineLabel = 'Claude' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const prependingRef = useRef(false)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop < 80 && !loadingEarlier && !exhausted && onLoadEarlier) {
      prevHeightRef.current = el.scrollHeight
      prependingRef.current = true
      onLoadEarlier()
    }
  }

  // items 变化后：上拉 prepend 时用 scrollHeight 差补偿、保持视觉位置；否则（首屏 / 新消息）滚到底。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prependingRef.current) {
      el.scrollTop += el.scrollHeight - prevHeightRef.current
      prependingRef.current = false
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [items])

  useEffect(() => {
    if (prependingRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [running])

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 py-4">
      {loadingEarlier && (
        <div className="text-center text-xs text-[var(--color-muted-foreground)]">加载更早…</div>
      )}
      {exhausted && items.length > 0 && (
        <div className="text-center text-xs text-[var(--color-muted-foreground)]">— 没有更早了 —</div>
      )}
      {items.map(item => (
        <Row key={item.id} item={item} onFork={onFork} />
      ))}
      {running && (
        <div className="text-sm text-[var(--color-muted-foreground)]">{engineLabel} 正在思考…</div>
      )}
    </div>
  )
}

/** 回复下方的一键复制：复制该条 assistant 的原始文本，移动端常显。 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 降级：clipboard API 不可用（非安全上下文等）时用隐藏 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* 忽略 */ }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="复制回复"
      className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] active:bg-[var(--color-muted)]"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

/** 转卡片：把该条回复 markdown 带入「Markdown 转卡片」模块（仅换正文，保留用户主题等偏好），跳转后选主题导出图片。 */
function ToCardButton({ text }: { text: string }) {
  const navigate = useNavigate()
  const toCard = () => {
    saveCardState({ ...loadCardState(), sourceText: text })
    navigate('/tools/markdown-card')
  }
  return (
    <button
      type="button"
      onClick={toCard}
      aria-label="转为卡片"
      title="把这条回复带入「Markdown 转卡片」，选主题后导出图片"
      className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] active:bg-[var(--color-muted)]"
    >
      <FileImage className="size-3.5" />
      转卡片
    </button>
  )
}

/** 消息块时间：当天显示 HH:mm，跨天显示 MM-DD HH:mm；无 ts（历史消息）返回空串。 */
function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

/** 消息块时间戳小字；无 ts 不渲染。 */
function TimeText({ ts, className }: { ts?: number; className?: string }) {
  const t = formatTime(ts)
  if (!t) return null
  return <span className={cn('px-1 text-[10px] tabular-nums text-[var(--color-muted-foreground)]', className)}>{t}</span>
}

function Row({ item, onFork }: { item: ChatItem; onFork?: (sdkUuid: string) => void }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="flex min-w-0 max-w-full flex-col items-end">
          <div className="max-w-[85%] min-w-0 whitespace-pre-wrap wrap-anywhere rounded-2xl bg-[var(--color-primary)] px-4 py-2 text-[var(--color-primary-foreground)]">
            {item.text}
          </div>
          <TimeText ts={item.ts} className="mt-0.5" />
          {onFork && item.sdkUuid && (
            <button
              type="button"
              onClick={() => onFork(item.sdkUuid!)}
              aria-label="从此处分叉对话"
              title="从此处分叉出新会话（保留当前会话）"
              className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] active:bg-[var(--color-muted)]"
            >
              <GitBranch className="size-3.5" />
              从此处分叉
            </button>
          )}
        </div>
      )
    case 'assistant':
      return (
        <div className="flex min-w-0 max-w-full flex-col items-start">
          <div className="max-w-[90%] min-w-0 wrap-anywhere rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 shadow-sm">
            <Markdown text={item.text} className="min-w-0" />
          </div>
          {item.text.trim() && (
            <div className="flex items-center gap-1">
              <CopyButton text={item.text} />
              <ToCardButton text={item.text} />
              <TimeText ts={item.ts} />
            </div>
          )}
        </div>
      )
    case 'tool':
      return <ToolCallBubble toolName={item.toolName} input={item.input} output={item.output} isError={item.isError} />
    case 'result':
      return (
        <div className="text-center text-xs text-[var(--color-muted-foreground)]">
          — 本轮结束（{item.stopReason}）{formatTime(item.ts) && ` · ${formatTime(item.ts)}`} —
        </div>
      )
    case 'error':
      return (
        <div className={cn('rounded-lg border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]')}>
          {item.code}: {item.message}
        </div>
      )
  }
}
