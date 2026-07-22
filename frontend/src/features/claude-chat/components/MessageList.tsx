import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { AlertTriangle, ArrowDown, Check, Coins, Copy, Database, FileImage, FileText, FolderOpen, GitBranch, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadState as loadCardState, saveState as saveCardState } from '@/features/markdown-card/lib/persistence'
import type { ChatItem, ConnState } from '../types'
import { abbr, cacheHitRate, fmtMs, formatTime, parseUsage } from '../lib/metrics'
import { useHideToolCalls } from '../lib/toolVisibilityPref'
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
  /** 会话标识：用于会话切换时重置虚拟列表内部状态（滚动位置/反向分页游标等），
   *  不传则退化为不区分会话（分屏/悬浮窗按各自的 sessionId 传，主视图按 chat.sessionId 传）。 */
  sessionKey?: string
}

/** 供外部（如「我的提问」导航面板）滚到指定消息并短暂高亮，方便一眼找到目标气泡。 */
export interface MessageListHandle {
  scrollToItem: (id: string) => void
  /** 滚到当前已加载的最早一条（index 0）。调用方需先自行把历史加载到头（exhausted），
   *  本方法本身不触发加载——「已加载的最早」和「整个会话的第一条」是否等价取决于调用方。 */
  scrollToStart: () => void
}

/** 反向分页起始游标：足够大，保证翻多少页历史都不会减到负数。 */
const FIRST_ITEM_INDEX_START = 100_000_000

/** 只在已经贴底时才跟随新内容自动滚动（'auto'=瞬间贴底，不用 'smooth' 避免流式逐字滚动动画抖动）。 */
function followOutput(isAtBottom: boolean): 'auto' | false {
  return isAtBottom ? 'auto' : false
}

/** 传给 Header/Footer 的高频变化值（流式输出期间 turnTokens 几乎每个 delta 都变）——
 *  必须走 virtuoso 的 context 机制而不是闭包 + useMemo 依赖，否则每次变化都会让
 *  components.Header/Footer 拿到"新的组件类型"，被 React 整个卸载重挂载一次，
 *  白白丢一次 ThinkingIndicator 的挂载态、还多做一次浏览器渲染。 */
interface ListContext {
  loadingEarlier: boolean
  exhausted: boolean
  itemCount: number
  running: boolean
  engineLabel: string
  turnTokens: number
  connState: ConnState
}

function ListHeader({ context }: { context?: ListContext }) {
  if (!context) return null
  return (
    <>
      {context.loadingEarlier && (
        <div className="py-2 text-center text-xs text-[var(--color-muted-foreground)]">加载更早…</div>
      )}
      {context.exhausted && context.itemCount > 0 && (
        <div className="py-2 text-center text-xs text-[var(--color-muted-foreground)]">— 没有更早了 —</div>
      )}
    </>
  )
}

function ListFooter({ context }: { context?: ListContext }) {
  if (!context?.running) return null
  return (
    <div className="px-3 pb-3">
      <ThinkingIndicator engineLabel={context.engineLabel} tokens={context.turnTokens} connState={context.connState} />
    </div>
  )
}

/** 模块级常量：Header/Footer 的组件引用永远不变，靠上面的 context（而非闭包）拿最新值。 */
const LIST_COMPONENTS = { Header: ListHeader, Footer: ListFooter }

/**
 * 消息流：用户气泡靠右、assistant 文本靠左、工具调用与系统标记居中。顶部上拉加载更早历史。
 *
 * 用 react-virtuoso 做虚拟滚动：同一时刻只挂载可视区域附近的消息节点，翻多少页历史 DOM
 * 规模都不再增长（此前是把每次 loadHistory 拉到的更早历史永久挂在 DOM 里，翻页越多、
 * 消息里的代码块/mermaid/图片越多，滚动和流式渲染就越卡）。
 *
 * 三个原本手写的滚动行为，都换成 virtuoso 内置能力：
 * - 反向无限滚动（上拉不跳动）：firstItemIndex，每次 prepend 就把它减去新增的条数。
 * - 贴底跟随/锁定：followOutput（默认只在已经贴底时才跟新内容走）+ atBottomStateChange。
 * - 跳到指定消息：scrollToIndex，配合 highlightedId 做短暂高亮（不再依赖 DOM 查询）。
 */
export const MessageList = forwardRef<MessageListHandle, Props>(function MessageList(
  { items, running, onLoadEarlier, loadingEarlier, exhausted, onFork, engineLabel = 'Claude', onResumeCurrent, onNewSession, onCleanRetry, turnTokens = 0, connState = 'ready', sessionKey },
  ref,
) {
  // 是否存在可分叉的用户消息（有 sdkUuid），供错误行的「清理异常并继续」判断可用性
  const hasForkTarget = useMemo(() => items.some(it => it.kind === 'user' && !!it.sdkUuid), [items])
  // 「隐藏工具调用」开关：开启时消息流里的工具调用气泡（MCP/命令/读写/子代理…）整条不渲染，减少视觉噪音
  const hideToolCalls = useHideToolCalls()
  const visibleItems = useMemo(() => (hideToolCalls ? items.filter(it => it.kind !== 'tool') : items), [items, hideToolCalls])

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  // 点击聊天里的图片放大查看（桌面点击 / 移动端轻触均可）
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null)
  // 「锁定位置」：贴底时新内容自动跟；用户滚离底部后 virtuoso 判定 atBottom=false，新增内容不再拽着视图跑。
  const [atBottom, setAtBottom] = useState(true)
  // 「我的提问」等外部调用 scrollToItem 后短暂高亮的目标 id（配合 kai-msg-flash 做一次性闪烁）。
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  // Virtuoso 的 key：切会话 或 切「隐藏工具调用」都整体重挂载虚拟列表——后者是因为过滤条件一变，
  // visibleItems 在各个位置对应的内容全变了（不是纯粹的头部/尾部增减），继续复用旧的尺寸缓存/
  // firstItemIndex 会跟实际内容对不上，直接重挂载最简单可靠（这个开关很少切，成本可以忽略）。
  const resetKey = `${sessionKey ?? ''}::${hideToolCalls ? 1 : 0}`

  // ── 反向分页游标：prepend 时把 firstItemIndex 减去新增条数，virtuoso 就知道"这批是往前接的"，
  //    保持滚动位置不跳动。在渲染期间比对 items 引用变化并同步调整（React 官方推荐的
  //    "根据 prop 变化调整 state"写法），避免多一个 effect 造成的一帧延迟/闪烁。
  const [firstItemIndex, setFirstItemIndex] = useState(FIRST_ITEM_INDEX_START)
  const prevResetKeyRef = useRef(resetKey)
  const prevItemsRef = useRef(visibleItems)
  if (resetKey !== prevResetKeyRef.current) {
    // 切会话/切过滤条件：virtuoso 会因为下面 key={resetKey} 整体重挂载，这里把游标也归零，两边保持一致。
    prevResetKeyRef.current = resetKey
    prevItemsRef.current = visibleItems
    if (firstItemIndex !== FIRST_ITEM_INDEX_START) setFirstItemIndex(FIRST_ITEM_INDEX_START)
  } else if (visibleItems !== prevItemsRef.current) {
    const prevArr = prevItemsRef.current
    const prevLen = prevArr.length
    const newLen = visibleItems.length
    if (newLen > prevLen) {
      const prevLastId = prevArr[prevLen - 1]?.id
      const newLastId = visibleItems[newLen - 1]?.id
      // 末尾 id 不变 = 新增的都在前面 = prepend（上拉加载更早历史）；末尾 id 变了 = append（新消息）。
      if (prevLen === 0 || prevLastId === newLastId) {
        setFirstItemIndex(idx => idx - (newLen - prevLen))
      }
    }
    prevItemsRef.current = visibleItems
  }

  const handleStartReached = useCallback(() => {
    if (!loadingEarlier && !exhausted) onLoadEarlier?.()
  }, [loadingEarlier, exhausted, onLoadEarlier])

  const jumpToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: Math.max(0, visibleItems.length - 1), align: 'end', behavior: 'smooth' })
    setAtBottom(true)
  }, [visibleItems.length])

  // 一轮开始（running 从 false→true，Footer 里的「思考中」指示器刚出现）时，若本来就贴底，
  // 主动贴一下——指示器的出现不改变 data 长度，followOutput 不会自动因此触发。
  useEffect(() => {
    if (running && atBottom) {
      virtuosoRef.current?.scrollToIndex({ index: Math.max(0, visibleItems.length - 1), align: 'end' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // 供「我的提问」导航面板等外部调用：滚到指定消息 + 短暂高亮闪一下，方便一眼找到目标气泡。
  useImperativeHandle(ref, () => ({
    scrollToItem: (id: string) => {
      const idx = visibleItems.findIndex(it => it.id === id)
      if (idx === -1) return
      virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' })
      setHighlightedId(id)
      window.setTimeout(() => setHighlightedId(cur => (cur === id ? null : cur)), 1500)
    },
    scrollToStart: () => {
      virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' })
    },
  }), [visibleItems])

  const itemContent = useCallback((_index: number, item: ChatItem) => (
    <div data-msg-id={item.id} className={cn('px-3 pb-3', item.id === highlightedId && 'kai-msg-flash rounded-2xl')}>
      <Row item={item} onFork={onFork} engineLabel={engineLabel} onResumeCurrent={onResumeCurrent} onNewSession={onNewSession}
        onCleanRetry={hasForkTarget ? onCleanRetry : undefined}
        onOpenImage={(src, alt) => setViewer({ src, alt })} />
    </div>
  ), [highlightedId, onFork, engineLabel, onResumeCurrent, onNewSession, onCleanRetry, hasForkTarget])

  // 高频变化值走 context（见 ListHeader/ListFooter 顶部注释），LIST_COMPONENTS 引用永远不变。
  const listContext: ListContext = { loadingEarlier: !!loadingEarlier, exhausted: !!exhausted, itemCount: visibleItems.length, running, engineLabel, turnTokens, connState }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <Virtuoso
        key={resetKey}
        ref={virtuosoRef}
        style={{ height: '100%' }}
        className="min-w-0 overflow-x-hidden"
        data={visibleItems}
        context={listContext}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={Math.max(0, visibleItems.length - 1)}
        alignToBottom
        followOutput={followOutput}
        atBottomThreshold={64}
        atBottomStateChange={setAtBottom}
        startReached={handleStartReached}
        computeItemKey={(_index, item) => item.id}
        itemContent={itemContent}
        components={LIST_COMPONENTS}
      />
      {/* 已锁定位置（滚离了底部）时的提示 + 快捷跳回：回答生成中最有用——一边看着之前内容，
          一边知道「新内容没有打断我、想看的话点一下就能追上」。 */}
      {!atBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-card-foreground)] shadow-lg transition-colors hover:bg-[var(--color-accent)]"
        >
          <ArrowDown className="size-3.5" />
          位置已锁定{running ? '· 新回复生成中' : ''} · 跳到最新
        </button>
      )}
      {viewer && <ImageLightbox src={viewer.src} alt={viewer.alt} onClose={() => setViewer(null)} />}
    </div>
  )
})

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
