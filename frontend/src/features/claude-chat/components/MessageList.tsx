import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Coins, Copy, FileImage, GitBranch, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadState as loadCardState, saveState as saveCardState } from '@/features/markdown-card/lib/persistence'
import type { ChatItem } from '../types'
import { abbr, fmtMs, formatTime, parseUsage } from '../lib/metrics'
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
        <Row key={item.id} item={item} onFork={onFork} engineLabel={engineLabel} />
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

type Tone = 'violet' | 'sky' | 'emerald' | 'rose' | 'muted'
const TONE: Record<Tone, string> = {
  violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300',
  muted: 'border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
}

/** 指标标签（圆角 badge，带图标/颜色）。有 onClick 则为可点（展开明细）。 */
function Chip({ tone, icon, children, onClick, title }: { tone: Tone; icon?: ReactNode; children?: ReactNode; onClick?: () => void; title?: string }) {
  const cls = cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums', TONE[tone], onClick && 'cursor-pointer select-none active:opacity-80')
  return onClick
    ? <button type="button" onClick={onClick} title={title} className={cls}>{icon}{children}</button>
    : <span title={title} className={cls}>{icon}{children}</span>
}

/** 消息头：角色名 + 时间（轻量、低饱和），按对齐方向排列。 */
function MsgHeader({ label, ts, align }: { label?: string; ts?: number; align: 'start' | 'end' }) {
  const t = formatTime(ts)
  if (!label && !t) return null
  return (
    <div className={cn('mb-0.5 flex items-center gap-1.5 px-1 text-[11px]', align === 'end' && 'flex-row-reverse')}>
      {label && <span className="font-medium text-[var(--color-muted-foreground)]">{label}</span>}
      {t && <time className="tabular-nums text-[var(--color-muted-foreground)] opacity-70">{t}</time>}
    </div>
  )
}

/** 本轮状态条：成功弱化为 ✓，token（紫，可点开明细）+ 耗时（蓝）+ 时间。 */
function TurnStatus({ item }: { item: Extract<ChatItem, { kind: 'result' }> }) {
  const [open, setOpen] = useState(false)
  const ok = item.stopReason === 'success' || item.stopReason === 'end_turn'
  const u = parseUsage(item.usage)
  const time = formatTime(item.ts)
  return (
    <div className="my-1 flex flex-col items-center gap-1">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Chip tone={ok ? 'emerald' : 'rose'} icon={ok ? <Check className="size-3" /> : <AlertTriangle className="size-3" />} title={`本轮结束：${item.stopReason}`}>
          {ok ? null : '失败'}
        </Chip>
        {u && u.total > 0 && (
          <Chip tone="violet" icon={<Coins className="size-3" />} onClick={() => setOpen(o => !o)} title="点击查看 token 明细">
            {abbr(u.total)}
          </Chip>
        )}
        {item.latencyMs != null && (
          <Chip tone="sky" icon={<Timer className="size-3" />} title={item.ttftMs != null ? `首字 ${fmtMs(item.ttftMs)}` : undefined}>
            {fmtMs(item.latencyMs)}
          </Chip>
        )}
        {time && <span className="px-1 text-[10px] tabular-nums text-[var(--color-muted-foreground)] opacity-70">{time}</span>}
      </div>
      {open && u && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
          <span>输入 {abbr(u.input)}</span>
          <span>输出 {abbr(u.output)}</span>
          {u.cache > 0 && <span>缓存 {abbr(u.cache)}</span>}
          {item.ttftMs != null && <span>首字 {fmtMs(item.ttftMs)}</span>}
          {item.latencyMs != null && <span>总耗时 {fmtMs(item.latencyMs)}</span>}
        </div>
      )}
    </div>
  )
}

function Row({ item, onFork, engineLabel }: { item: ChatItem; onFork?: (sdkUuid: string) => void; engineLabel?: string }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="flex min-w-0 max-w-full flex-col items-end">
          <MsgHeader ts={item.ts} align="end" />
          <div className="max-w-[85%] min-w-0 whitespace-pre-wrap wrap-anywhere rounded-2xl bg-[var(--color-primary)] px-4 py-2 text-[var(--color-primary-foreground)]">
            {item.text}
          </div>
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
          <MsgHeader label={engineLabel} ts={item.ts} align="start" />
          <div className="max-w-[90%] min-w-0 wrap-anywhere rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 shadow-sm">
            <Markdown text={item.text} className="min-w-0" />
          </div>
          {item.text.trim() && (
            <div className="flex items-center gap-1">
              <CopyButton text={item.text} />
              <ToCardButton text={item.text} />
            </div>
          )}
        </div>
      )
    case 'tool':
      return <ToolCallBubble toolName={item.toolName} input={item.input} output={item.output} isError={item.isError} />
    case 'result':
      return <TurnStatus item={item} />
    case 'error':
      return (
        <div className={cn('rounded-lg border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]')}>
          {item.code}: {item.message}
        </div>
      )
  }
}
