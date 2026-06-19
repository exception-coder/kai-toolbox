import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Bot, Check, Code, Coins, Database, FileSearch, FolderKanban, Timer, User, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageView, ToolStep } from '../types'
import { abbr, cacheHitRate, fmtMs, formatTime } from '../lib/metrics'
import { Markdown } from './Markdown'

interface Props {
  messages: MessageView[]
  streaming: boolean
  streamText: string
  /** 流式期间的工具调用步骤(agent 作业可视化)。 */
  toolSteps?: ToolStep[]
  /** 空状态点能力建议时回传建议文案，父灌入输入框。 */
  onPickSuggestion?: (text: string) => void
}

const SUGGESTIONS = [
  { icon: Code, label: '编写代码', text: '帮我写一段代码：' },
  { icon: FileSearch, label: '分析日志', text: '帮我分析这段日志，定位问题：' },
  { icon: FolderKanban, label: '管理项目', text: '帮我梳理这个项目的任务与进度：' },
  { icon: Wrench, label: '调用工具', text: '帮我用合适的工具完成：' },
]

export function MessageList({ messages, streaming, streamText, toolSteps, onPickSuggestion }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, streaming, toolSteps])

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
          {/* 助手消息走 markdown 渲染；用户原始输入按纯文本（不经 HTML 注入）。 */}
          {m.role === 'ASSISTANT' ? (
            <Markdown text={m.content} />
          ) : (
            <div className="whitespace-pre-wrap break-words">{m.content}</div>
          )}
          {m.role === 'ASSISTANT' && <MetricsFooter message={m} />}
        </Bubble>
      ))}
      {streaming && (
        <Bubble role="ASSISTANT">
          <div className="min-w-0">
            {toolSteps && toolSteps.length > 0 && <ToolSteps steps={toolSteps} />}
            <Markdown text={streamText} className="inline" />
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
          </div>
        </Bubble>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

/** 流式期间渲染工具调用步骤：调用中转圈、完成打勾，可展开看入参/结果。 */
function ToolSteps({ steps }: { steps: ToolStep[] }) {
  return (
    <div className="mb-2 space-y-1.5">
      {steps.map((s, i) => (
        <details
          key={`${s.round}-${s.name}-${i}`}
          className="rounded-lg border bg-[var(--color-muted)]/40 px-2.5 py-1.5 text-xs"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2">
            {s.status === 'running' ? (
              <Wrench className="size-3.5 shrink-0 animate-pulse text-[var(--color-primary)]" />
            ) : (
              <Check className="size-3.5 shrink-0 text-emerald-500" />
            )}
            <span className="font-medium">
              {s.status === 'running' ? '正在调用工具' : '已调用工具'}
              <code className="ml-1 rounded bg-[var(--color-background)] px-1 py-0.5">{s.name}</code>
            </span>
          </summary>
          <div className="mt-1.5 space-y-1 pl-5">
            {s.arguments && s.arguments !== '{}' && (
              <div className="break-words text-[var(--color-muted-foreground)]">
                入参：<code className="break-all">{s.arguments}</code>
              </div>
            )}
            {s.result != null && (
              <div className="whitespace-pre-wrap break-words text-[var(--color-muted-foreground)]">
                结果：{s.result}
              </div>
            )}
          </div>
        </details>
      ))}
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

type Tone = 'violet' | 'sky' | 'emerald' | 'rose' | 'teal'
const TONE: Record<Tone, string> = {
  violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300',
  teal: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300',
}

/** 指标标签（圆角 badge，带图标/颜色）。有 onClick 则为可点（展开明细）。 */
function Chip({ tone, icon, children, onClick, title }: { tone: Tone; icon?: ReactNode; children?: ReactNode; onClick?: () => void; title?: string }) {
  const cls = cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums',
    TONE[tone],
    onClick && 'cursor-pointer select-none active:opacity-80',
  )
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={cls}>{icon}{children}</button>
  ) : (
    <span title={title} className={cls}>{icon}{children}</span>
  )
}

/**
 * 助手消息指标行（对齐 claude-chat）：状态 ✓/失败 · token（紫，可点开明细）· 缓存命中率（青）· 耗时（蓝）· 时间。
 * token chip 点开展示输入/输出/缓存读明细。无任何指标（旧消息/网关未返回）时只显示状态与时间。
 */
function MetricsFooter({ message }: { message: MessageView }) {
  const [open, setOpen] = useState(false)
  const ok = message.status === 'DONE'
  const total = message.totalTokens ?? null
  const hit = cacheHitRate(message)
  const latency = fmtMs(message.latencyMs)
  const time = formatTime(message.createdAt)
  const statusTitle = ok ? '本轮完成' : message.status === 'INTERRUPTED' ? '已停止' : '出错'
  const canExpand = message.promptTokens != null || message.completionTokens != null || message.cachedTokens != null

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={ok ? 'emerald' : 'rose'} icon={ok ? <Check className="size-3" /> : <AlertTriangle className="size-3" />} title={statusTitle}>
          {ok ? null : message.status === 'INTERRUPTED' ? '已停止' : '失败'}
        </Chip>
        {total != null && total > 0 && (
          <Chip tone="violet" icon={<Coins className="size-3" />} onClick={canExpand ? () => setOpen((o) => !o) : undefined} title={canExpand ? '点击查看 token 明细' : undefined}>
            {abbr(total)}
          </Chip>
        )}
        {hit != null && hit > 0 && (
          <Chip tone="teal" icon={<Database className="size-3" />} onClick={canExpand ? () => setOpen((o) => !o) : undefined} title="缓存命中率（命中部分≈不计费）">
            {Math.floor(hit * 100)}%
          </Chip>
        )}
        {latency && (
          <Chip tone="sky" icon={<Timer className="size-3" />}>{latency}</Chip>
        )}
        {time && <span className="px-1 text-[10px] tabular-nums text-[var(--color-muted-foreground)] opacity-70">{time}</span>}
      </div>
      {open && canExpand && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
          {message.promptTokens != null && <span>输入 {abbr(message.promptTokens)}</span>}
          {message.completionTokens != null && <span>输出 {abbr(message.completionTokens)}</span>}
          {message.cachedTokens != null && message.cachedTokens > 0 && <span>缓存读 {abbr(message.cachedTokens)}</span>}
          {hit != null && <span>命中 {Math.floor(hit * 100)}%</span>}
          {message.latencyMs != null && <span>耗时 {fmtMs(message.latencyMs)}</span>}
        </div>
      )}
    </div>
  )
}
