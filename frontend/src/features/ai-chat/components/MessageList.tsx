import { useEffect, useRef } from 'react'
import { Bot, Clock, Code, Coins, Database, FileSearch, FolderKanban, User, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageView } from '../types'
import { abbr, cacheHitRate, fmtMs, formatTime, hasMetrics } from '../lib/metrics'

interface Props {
  messages: MessageView[]
  streaming: boolean
  streamText: string
  /** 空状态点能力建议时回传建议文案，父灌入输入框。 */
  onPickSuggestion?: (text: string) => void
}

const SUGGESTIONS = [
  { icon: Code, label: '编写代码', text: '帮我写一段代码：' },
  { icon: FileSearch, label: '分析日志', text: '帮我分析这段日志，定位问题：' },
  { icon: FolderKanban, label: '管理项目', text: '帮我梳理这个项目的任务与进度：' },
  { icon: Wrench, label: '调用工具', text: '帮我用合适的工具完成：' },
]

export function MessageList({ messages, streaming, streamText, onPickSuggestion }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, streaming])

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Bot className="size-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">今天想做什么？</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">选一个开始，或直接在下方输入</p>
        <div className="mt-5 grid w-full max-w-md grid-cols-2 gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onPickSuggestion?.(s.text)}
              className="flex items-center gap-2 rounded-xl border bg-[var(--color-background)] px-3 py-2.5 text-left text-sm transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-accent)]"
            >
              <s.icon className="size-4 shrink-0 text-[var(--color-primary)]" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">

      {messages.map((m) => (
        <Bubble key={m.id} role={m.role}>
          {m.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {m.attachments.map((a) => (
                <img key={a.id} src={a.url} alt={a.name} className="max-h-40 rounded-md border" />
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{m.content}</div>
          {m.status === 'INTERRUPTED' && <StatusNote text="已停止" />}
          {m.status === 'ERROR' && <StatusNote text="出错" error />}
          {m.role === 'ASSISTANT' && <MetricsFooter message={m} />}
        </Bubble>
      ))}
      {streaming && (
        <Bubble role="ASSISTANT">
          <div className="whitespace-pre-wrap break-words">
            {streamText}
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
          </div>
        </Bubble>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

function Bubble({ role, children }: { role: MessageView['role']; children: React.ReactNode }) {
  const isUser = role === 'USER'
  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
            : 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
          isUser
            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
            : 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * 助手消息指标行：时间 · 耗时 · token（总量，悬浮看输入/输出）· 缓存命中率。
 * 全空（历史旧消息或网关未返回）则只显示时间，仍保留时间不致空行突兀。
 */
function MetricsFooter({ message }: { message: MessageView }) {
  const time = formatTime(message.createdAt)
  const latency = fmtMs(message.latencyMs)
  const total = message.totalTokens ?? null
  const hit = cacheHitRate(message)
  const tokenTitle = [
    message.promptTokens != null ? `输入 ${message.promptTokens.toLocaleString()}` : null,
    message.completionTokens != null ? `输出 ${message.completionTokens.toLocaleString()}` : null,
    message.cachedTokens != null ? `缓存读 ${message.cachedTokens.toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-none text-[var(--color-muted-foreground)] tabular-nums">
      {time && (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {time}
        </span>
      )}
      {latency && <span className="inline-flex items-center gap-1">{latency}</span>}
      {total != null && (
        <span className="inline-flex items-center gap-1" title={tokenTitle || undefined}>
          <Coins className="size-3" />
          {abbr(total)}
        </span>
      )}
      {hit != null && hit > 0 && (
        <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400" title="缓存命中率（命中部分≈不计费）">
          <Database className="size-3" />
          {Math.floor(hit * 100)}%
        </span>
      )}
      {!hasMetrics(message) && <span className="text-[var(--color-muted-foreground)]/70">—</span>}
    </div>
  )
}

function StatusNote({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      className={cn(
        'mt-1 text-xs',
        error ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]',
      )}
    >
      — {text}
    </div>
  )
}
