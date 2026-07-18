import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Coins, Copy, Database, FileImage, FileText, FolderOpen, GitBranch, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadState as loadCardState, saveState as saveCardState } from '@/features/markdown-card/lib/persistence'
import type { ChatItem, ConnState } from '../types'
import { abbr, cacheHitRate, fmtMs, formatTime, parseUsage } from '../lib/metrics'
import { ToolCallBubble } from './ToolCallBubble'
import { Markdown } from './Markdown'
import { ImageLightbox } from './ImageLightbox'
import { ThinkingIndicator } from './ThinkingIndicator'

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
  onResumeCurrent?: () => void
  /** QUERY_FAILED/No conversation found 时在同目录新建会话。 */
  onNewSession?: () => void
  /** 清理异常并继续：坏 thinking 块等毒化会话、每轮都报错时，分叉到出错前并续上。 */
  onCleanRetry?: () => void
  /** 本轮进行中的实时输出 token 数，显示在「进行时」指示器上（0=不显示）。 */
  turnTokens?: number
  /** WS 连接状态：非 ready 时「进行时」指示器改显示「连接中断，重连中」，避免误导为 AI 在思考。 */
  connState?: ConnState
}

/** 消息流：用户气泡靠右、assistant 文本靠左、工具调用与系统标记居中。顶部上拉加载更早历史。 */
export function MessageList({ items, running, onLoadEarlier, loadingEarlier, exhausted, onFork, engineLabel = 'Claude', onResumeCurrent, onNewSession, onCleanRetry, turnTokens = 0, connState = 'ready' }: Props) {
  // 是否存在可分叉的用户消息（有 sdkUuid），供错误行的「清理异常并继续」判断可用性
  const hasForkTarget = items.some(it => it.kind === 'user' && !!it.sdkUuid)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const prependingRef = useRef(false)
  // 点击聊天里的图片放大查看（桌面点击 / 移动端轻触均可）
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null)

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
        <Row key={item.id} item={item} onFork={onFork} engineLabel={engineLabel} onResumeCurrent={onResumeCurrent} onNewSession={onNewSession}
          onCleanRetry={hasForkTarget ? onCleanRetry : undefined}
          onOpenImage={(src, alt) => setViewer({ src, alt })} />
      ))}
      {running && <ThinkingIndicator engineLabel={engineLabel} tokens={turnTokens} connState={connState} />}
      {viewer && <ImageLightbox src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
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

type Tone = 'violet' | 'sky' | 'emerald' | 'rose' | 'teal' | 'muted'
const TONE: Record<Tone, string> = {
  violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300',
  teal: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300',
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
  const hit = cacheHitRate(item.usage)
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
        {hit != null && hit > 0 && (
          <Chip tone="teal" icon={<Database className="size-3" />} onClick={() => setOpen(o => !o)} title="缓存命中率（命中部分≈不计费）；向下取整，仅真正全命中才显示 100%">
            {Math.floor(hit * 100)}%
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
          {u.cache > 0 && <span>缓存读 {abbr(u.cacheRead)} / 写 {abbr(u.cache - u.cacheRead)}</span>}
          {hit != null && <span>命中 {Math.floor(hit * 100)}%</span>}
          {item.ttftMs != null && <span>首字 {fmtMs(item.ttftMs)}</span>}
          {item.latencyMs != null && <span>总耗时 {fmtMs(item.latencyMs)}</span>}
        </div>
      )}
    </div>
  )
}

function Row({ item, onFork, engineLabel, onResumeCurrent, onNewSession, onCleanRetry, onOpenImage }: { item: ChatItem; onFork?: (sdkUuid: string) => void; engineLabel?: string; onResumeCurrent?: () => void; onNewSession?: () => void; onCleanRetry?: () => void; onOpenImage?: (src: string, alt: string) => void }) {
  // displayText：Forge 机器人等「seed 转发」场景会隐藏实际发给 agent 的完整门控样板文案，只显示用户
  // 真正输入的那句话；保留一个不打眼的展开入口，避免完全不可见（可回看到底发了什么）。仅 'user' 项用到，
  // 但 Hooks 规则要求无条件调用，放在 switch 之外（对其它 kind 是无副作用的多余 state，可忽略）。
  const [showRaw, setShowRaw] = useState(false)
  switch (item.kind) {
    case 'user': {
      const hasOverride = !!item.displayText
      const shown = showRaw ? item.text : (item.displayText ?? item.text)
      return (
        <div className="flex min-w-0 max-w-full flex-col items-end">
          <MsgHeader ts={item.ts} align="end" />
          {item.attachments && item.attachments.length > 0 && (
            <div className="mb-1 flex max-w-[85%] flex-col items-end gap-1.5">
              {/* 图片：有预览 URL，按两列网格展示 */}
              {item.attachments.filter(a => a.url && a.mime?.startsWith('image/')).length > 0 && (
                <div className={cn(
                  'flex flex-wrap justify-end gap-1.5',
                  item.attachments.filter(a => a.url && a.mime?.startsWith('image/')).length >= 2 && 'grid grid-cols-2',
                )}>
                  {item.attachments.filter(a => a.url && a.mime?.startsWith('image/')).map((a, i) => (
                    <img
                      key={i}
                      src={a.url}
                      alt={a.name}
                      title={`${a.name}（点击查看大图）`}
                      onClick={() => onOpenImage?.(a.url!, a.name)}
                      className={cn(
                        'cursor-zoom-in rounded-xl border border-[var(--color-border)] object-cover transition-opacity hover:opacity-90',
                        item.attachments!.filter(a => a.url && a.mime?.startsWith('image/')).length === 1
                          ? 'max-h-60 max-w-full'
                          : 'h-32 w-full',
                      )}
                    />
                  ))}
                </div>
              )}
              {/* 非图片文件：文件卡片 */}
              {item.attachments.filter(a => !a.url || !a.mime?.startsWith('image/')).map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm text-[var(--color-primary-foreground)]"
                  title={a.name}
                >
                  <FileText className="size-4 shrink-0 opacity-80" />
                  <span className="max-w-[16rem] truncate">{a.name}</span>
                  {a.mime && (
                    <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase opacity-80">
                      {a.mime.split('/').pop()?.split('+')[0] ?? 'file'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {shown && (
            <div className="max-w-[85%] min-w-0 whitespace-pre-wrap wrap-anywhere rounded-2xl bg-[var(--color-primary)] px-4 py-2 text-[var(--color-primary-foreground)]">
              {shown}
            </div>
          )}
          {(shown.trim() || (onFork && item.sdkUuid) || hasOverride) && (
            <div className="mt-1 flex items-center gap-1">
              {shown.trim() && <CopyButton text={shown} />}
              {hasOverride && (
                <button
                  type="button"
                  onClick={() => setShowRaw(v => !v)}
                  aria-label={showRaw ? '收起，只看简述' : '查看实际发送的完整内容'}
                  title={showRaw ? '收起，只看简述' : '这条气泡隐藏了实际发给 AI 的完整内容，点开查看'}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] active:bg-[var(--color-muted)]"
                >
                  <FileText className="size-3.5" />
                  {showRaw ? '收起' : '完整内容'}
                </button>
              )}
              {onFork && item.sdkUuid && (
                <button
                  type="button"
                  onClick={() => onFork(item.sdkUuid!)}
                  aria-label="从此处分叉对话"
                  title="从此处分叉出新会话（保留当前会话）"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] active:bg-[var(--color-muted)]"
                >
                  <GitBranch className="size-3.5" />
                  从此处分叉
                </button>
              )}
            </div>
          )}
        </div>
      )
    }
    case 'assistant':
      return (
        <div className="flex min-w-0 max-w-full flex-col items-start">
          <MsgHeader label={engineLabel} ts={item.ts} align="start" />
          <div className="max-w-[90%] min-w-0 wrap-anywhere rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 text-[var(--color-card-foreground)] shadow-sm">
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
    case 'error': {
      // 会话历史丢失（对应 JSONL 文件不存在），任何 resume 都无法恢复，需新建会话
      const isPermanentlyLost = item.code === 'QUERY_FAILED' && !!item.message?.includes('No conversation found')
      // 坏 thinking 块签名类 400：会话被毒化，原地 resume 会把坏块反复发出→每轮都失败，
      // 只能分叉到出错前（丢掉中毒回合）才能续。识别后主推「清理异常并继续」。
      const isPoisoned = !isPermanentlyLost && /signature in thinking block|invalid signature/i.test(item.message ?? '')
      return (
        <div className={cn('flex max-w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
          isPermanentlyLost
            ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
        )}>
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">
            {isPermanentlyLost
              ? '会话记录已永久丢失（Claude Code 历史文件不存在），resume 无法恢复。建议新建会话。'
              : isPoisoned
                ? `会话上下文异常（思考块签名失效），原地重试会一直失败。可「清理异常并继续」——分叉到出错前、丢掉异常回合后续上。（${item.message}）`
                : `${item.code}: ${item.message}`}
          </span>
          {isPermanentlyLost ? (
            onNewSession && (
              <button
                type="button"
                onClick={onNewSession}
                className="shrink-0 rounded-md border border-red-300 bg-[var(--color-background)] px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-900"
              >
                <FolderOpen className="mr-1 inline size-3.5" />
                新建会话（同目录）
              </button>
            )
          ) : isPoisoned && onCleanRetry ? (
            <button
              type="button"
              onClick={onCleanRetry}
              className="shrink-0 rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
            >
              清理异常并继续
            </button>
          ) : (
            onResumeCurrent && (
              <button
                type="button"
                onClick={onResumeCurrent}
                className="shrink-0 rounded-md border border-amber-300 bg-[var(--color-background)] px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
              >
                原地 resume
              </button>
            )
          )}
        </div>
      )
    }
  }
}
