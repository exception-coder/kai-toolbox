import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Cloud, Compass, LayoutGrid, List, Loader2, Maximize2, MessageSquare, Mic, Minus, Paperclip, Plus, RotateCw, Send, Shield, ShieldCheck, X } from 'lucide-react'
import { CHAT_ROUTE, useChatRuntime } from '../runtime/ChatRuntimeContext'
import { isShowcasePath } from '@/shell/featureRegistry'
import { ThemeMenu } from '@/shell/ThemeMenu'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { MessageList } from './MessageList'
import { SessionList } from './SessionList'
import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import { AttachmentChips } from './AttachmentChips'
import { VoiceInputButton } from './VoiceInputButton'
import { MiniVoiceBar } from './MiniVoiceBar'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { listSessions, resolveModule, transcribe, uploadAttachment, type UploadedAttachment } from '../api'
import type { ChatItem, ModuleCandidate, PermissionMode } from '../types'
import { engineDisplayName, providerHost } from './chatStatus'

const MAX_ATTACHMENTS = 10
const MIN_MARGIN = 8
const MIN_W = 280
const MIN_H = 320
const BUBBLE = 48
const AUTO_APPROVE_KEY = 'kai-toolbox:auto-approve-permission'
const GIFT_CONCIERGE_IMAGE = '/assets/welfare-sign/duanwu-concierge.svg'
type FloatAttachment = UploadedAttachment & { previewUrl?: string }

/** 权限模式循环顺序与中文标签（紧凑切换用，复刻 Shift+Tab 体验）。 */
const MODE_ORDER: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
const MODE_LABELS: Record<PermissionMode, string> = {
  default: '默认',
  acceptEdits: '自动接受',
  plan: '计划',
  bypassPermissions: '全自动',
}

/** 由会话状态推导「进度文案 + 是否活跃」：待确认 / 思考中 / 执行中 / 出错 / 空闲。 */
function deriveStatus(items: ChatItem[], running: boolean, hasPermission: boolean, hasQuestion: boolean): { status: string; active: boolean } {
  const last = items[items.length - 1]
  if (hasPermission) return { status: '待确认权限', active: true }
  if (hasQuestion) return { status: '待回答提问', active: true }
  if (running) return { status: last?.kind === 'tool' ? '执行中…' : '思考中…', active: true }
  if (last?.kind === 'error') return { status: '出错', active: false }
  return { status: '空闲', active: false }
}

/** cwd 归一化，用于按工作目录匹配已有会话（与 ProjectWorkspacePage 一致）。 */
function normalizePath(p: string): string {
  return p.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * 「路由 vs 对话」确定性门控：仅当出现显式路由信号才返回模块提示词，否则 null（按对话处理）。
 * 信号 = `/goto <模块>` 命令，或导航专用动词前缀（高精度，不与普通编码对话误撞）。
 */
const ROUTE_VERBS = ['去开发', '去做', '去模块', '打开模块', '定位模块', '切到模块', '切模块', '进入模块', '路由到', '跳到模块']
function parseRouteIntent(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const slash = t.match(/^\/goto\s+(.+)$/i)
  if (slash) return slash[1].trim()
  for (const v of ROUTE_VERBS) {
    if (t.startsWith(v)) {
      const rest = t.slice(v.length).replace(/^[\s:：]+/, '').trim()
      if (rest) return rest
    }
  }
  return null
}

/**
 * 跨路由常驻的可拖拽 / 可调大小悬浮对话窗。仅在「已弹出 + 引擎已激活 + 当前不在会话页」时渲染，
 * 避免与全屏会话页双份 UI。操作的是 Context 里的同一聊天实例（同一 WS、同一会话）。
 */
export function FloatingChatWindow() {
  const { chat, demo, concierge, floating, setFloating, minimized, setMinimized, pos, setPos, size, setSize, setVoiceMode } = useChatRuntime()
  // 吉祥物图：demo 演示页按主题注入覆盖，否则用内置默认。
  const conciergeSrc = concierge ?? GIFT_CONCIERGE_IMAGE
  const location = useLocation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [showSessions, setShowSessions] = useState(false)
  // 迷你版（默认）：只显示进度状态 + 语音/输入/发送，不铺消息流；点切换看完整对话。
  // demo（受约束演示）默认展开完整对话，便于直接看到改动反馈。
  const [compact, setCompact] = useState(!demo)
  const [attachments, setAttachments] = useState<FloatAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [autoApprove, setAutoApprove] = useState(() => localStorage.getItem(AUTO_APPROVE_KEY) === '1')
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const bubbleRef = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean; long: boolean } | null>(null)
  const bubbleLongTimer = useRef<number | null>(null) // 最小化气泡长按计时器：长按未拖动 → 原地录音
  const bubbleRec = useVoiceRecorder()
  const [bubbleListening, setBubbleListening] = useState(false) // 气泡正在听（录音中）
  const [bubbleRecBusy, setBubbleRecBusy] = useState(false)     // 松手后转写中
  const autoApprovedRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const confirm = useConfirm()
  // 模块路由（说一句话去开发某模块）：candidates 为多候选待选；note 为提示文案
  const [routeCands, setRouteCands] = useState<ModuleCandidate[] | null>(null)
  const [routeNote, setRouteNote] = useState<string | null>(null)
  const [routeBusy, setRouteBusy] = useState(false)

  // 输入框随内容自动升高（参考微信）：到 max-h 后内部滚动
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // 顶栏会话别名（与会话列表共用同一 query 缓存）
  const { data: sessions = [] } = useQuery({
    queryKey: ['claude-chat-sessions'],
    queryFn: listSessions,
    enabled: floating,
    staleTime: 5000,
  })
  const currentTitle = sessions.find(s => s.id === chat?.sessionId)?.title?.trim()
  const headerTitle = currentTitle || 'Vibe Coding'

  // 拉起某模块会话：有该 cwd 的会话则续接，否则新建；随后进全屏会话页（与项目工作台一致）。
  const launchModule = (c: ModuleCandidate) => {
    if (!chat) return
    const sess = sessions.find(s => normalizePath(s.cwd) === normalizePath(c.module.absPath))
    if (sess) chat.switchTo(sess.id); else chat.open(c.module.absPath)
    setRouteCands(null); setRouteNote(null); setDraft('')
    setMinimized(false)
    navigate(CHAT_ROUTE)
  }
  // 确定性解析模块提示词：0=没匹配(提示)，1=确认后跳，多=列候选让用户点。
  const doRoute = async (hint: string) => {
    setRouteNote(null); setRouteCands(null); setRouteBusy(true)
    try {
      const res = await resolveModule(hint)
      const cs = res.candidates
      if (cs.length === 0) { setRouteNote(`没找到匹配「${hint}」的模块`); return }
      if (cs.length === 1) {
        const c = cs[0]
        const ok = await confirm({ title: '去开发模块', description: `跳转到「${c.project} / ${c.module.name}」开发？`, confirmText: '去开发' })
        if (ok) launchModule(c)
        return
      }
      setRouteCands(cs)
    } catch (e) {
      setRouteNote(e instanceof Error ? e.message : '模块解析失败')
    } finally {
      setRouteBusy(false)
    }
  }
  // 统一入口：命中路由信号 → 走路由(返回 true，不当对话发)；否则返回 false 由调用方按对话处理。
  const handleUserText = (text: string): boolean => {
    const hint = parseRouteIntent(text)
    if (hint == null) return false
    void doRoute(hint)
    return true
  }

  // 全自动·弹窗自动允许：浮窗态下 ChatPage 已卸载，自动放行 effect 必须在本组件跑。
  useEffect(() => {
    if (!chat || chat.mode !== 'bypassPermissions' || !autoApprove) return
    const p = chat.pending
    if (p?.kind !== 'permission') return
    if (autoApprovedRef.current === p.reqId) return
    autoApprovedRef.current = p.reqId
    chat.decide({ type: 'decision', reqId: p.reqId, behavior: 'allow' })
  }, [chat, autoApprove])

  // 在会话页时不渲染（全屏页已在），未弹出或引擎未就绪也不渲染
  if (!floating || !chat || location.pathname === CHAT_ROUTE) return null

  const engineLabel = engineDisplayName(chat.currentEngine, chat.currentProviderKind)
  const host = providerHost(chat.currentProviderBaseUrl)
  const engineTitle = chat.currentProviderKind === 'thirdParty'
    ? `第三方网关：${host ?? chat.currentProviderBaseUrl ?? '未知'}`
    : undefined
  // 展示页脱离 AppShell（无 Sidebar/TopBar），把「返回工作台 + 主题」收进本窗口 header，
  // 这样展示页不必再悬浮一组独立控件（ShowcaseLayout 的 dock 在本窗可见时隐藏）。
  const onShowcase = isShowcasePath(location.pathname)
  // 礼赠助手皮肤：福利签收相关页（含受约束演示）启用，与端午页面同色系。
  const giftMode = location.pathname.startsWith('/tools/welfare-sign') || demo

  const toggleAutoApprove = () => setAutoApprove(v => {
    const nv = !v
    localStorage.setItem(AUTO_APPROVE_KEY, nv ? '1' : '0')
    return nv
  })

  // 点击循环切换权限模式（下一轮生效，与全屏 ModeSwitch 同语义）
  const cycleMode = () => {
    const i = MODE_ORDER.indexOf(chat.mode)
    chat.setMode(MODE_ORDER[(i + 1) % MODE_ORDER.length])
  }

  // 权限/提问弹框：悬浮态下也由本组件渲染（ChatPage 已卸载），否则用户无从作答。
  const pending = chat.pending
  const { status, active } = deriveStatus(chat.items, chat.running, pending?.kind === 'permission', pending?.kind === 'question')
  const dialogs = (
    <>
      {pending?.kind === 'permission' && (
        <PermissionDialog
          toolName={pending.toolName}
          input={pending.input}
          onAllow={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })}
          onDeny={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
        />
      )}
      {pending?.kind === 'question' && (
        <QuestionDialog
          questions={pending.questions}
          onCancel={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
          onSubmit={answers => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow', answers })}
        />
      )}
    </>
  )

  const clamp = (x: number, y: number) => ({
    x: Math.max(MIN_MARGIN, Math.min(x, window.innerWidth - size.w - MIN_MARGIN)),
    y: Math.max(MIN_MARGIN, Math.min(y, window.innerHeight - 80)),
  })

  // 标题栏拖拽移动窗口
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, textarea, input, select')) return
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setPos(clamp(e.clientX - d.dx, e.clientY - d.dy))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  // 右下角拖拽调整大小
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current
    if (!r) return
    const w = Math.max(MIN_W, Math.min(r.w + (e.clientX - r.x), window.innerWidth - pos.x - MIN_MARGIN))
    const h = Math.max(MIN_H, Math.min(r.h + (e.clientY - r.y), window.innerHeight - pos.y - MIN_MARGIN))
    setSize({ w, h })
  }
  const onResizeUp = (e: React.PointerEvent) => {
    resizeRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  // 最小化气泡拖拽（拖动则移动，未拖动视为点击展开）
  // 松手后：停止录音 → 转写 → 有文本就自动发送（取消/失败则丢弃，不发送）。
  const finishBubbleListen = async () => {
    setBubbleListening(false)
    try {
      const blob = await bubbleRec.stop()
      setBubbleRecBusy(true)
      const text = (await transcribe(blob)).trim()
      if (text && !handleUserText(text)) chat.send(text)
    } catch {
      /* 录音过短/转写失败：静默丢弃 */
    } finally {
      setBubbleRecBusy(false)
    }
  }

  const onBubbleDown = (e: React.PointerEvent) => {
    bubbleRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false, long: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (bubbleLongTimer.current) clearTimeout(bubbleLongTimer.current)
    // 长按 450ms 且未拖动 → 小人原地变「正在听」并开始录音（不展开、不弹云朵）。不支持录音则当普通长按，松手照常展开。
    bubbleLongTimer.current = window.setTimeout(() => {
      const b = bubbleRef.current
      if (!b || b.moved || !bubbleRec.supported) return
      b.long = true
      bubbleRec.start().then(() => setBubbleListening(true)).catch(() => { if (bubbleRef.current) bubbleRef.current.long = false })
    }, 450)
  }
  const onBubbleMove = (e: React.PointerEvent) => {
    const b = bubbleRef.current
    if (!b) return
    if (b.long) return // 录音中：不移动气泡、不打断
    if (Math.abs(e.clientX - b.sx) > 3 || Math.abs(e.clientY - b.sy) > 3) {
      b.moved = true
      if (bubbleLongTimer.current) { clearTimeout(bubbleLongTimer.current); bubbleLongTimer.current = null } // 拖动即取消长按
    }
    setPos({
      x: Math.max(0, Math.min(e.clientX - b.dx, window.innerWidth - BUBBLE)),
      y: Math.max(0, Math.min(e.clientY - b.dy, window.innerHeight - BUBBLE)),
    })
  }
  const onBubbleUp = (e: React.PointerEvent) => {
    if (bubbleLongTimer.current) { clearTimeout(bubbleLongTimer.current); bubbleLongTimer.current = null }
    const b = bubbleRef.current
    bubbleRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (b?.long) void finishBubbleListen()          // 长按录音 → 松手转写并自动发送
    else if (b && !b.moved) setMinimized(false)      // 短按 → 展开
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !chat.sessionId) return
    const room = MAX_ATTACHMENTS - attachments.length - uploading
    const sid = chat.sessionId
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      setUploading(n => n + 1)
      try {
        const att = await uploadAttachment(sid, f)
        const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
        setAttachments(prev => [...prev, { ...att, previewUrl }])
      } catch (e) {
        console.error('[claude-chat] 悬浮窗附件上传失败', e)
      } finally {
        setUploading(n => n - 1)
      }
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void uploadFiles(files)
    }
  }

  const submit = () => {
    const t = draft.trim()
    const hasAtt = attachments.length > 0
    if ((!t && !hasAtt) || chat.running) return
    // 纯文本且命中路由信号(/goto 或导航动词) → 走模块路由，不当对话发出
    if (!hasAtt && handleUserText(t)) { setDraft(''); return }
    chat.send(t, hasAtt ? attachments.map(a => ({ name: a.name, path: a.path })) : undefined)
    attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setDraft('')
    setAttachments([])
    // 发送后收回输入框高度：等 DOM 清空（下一帧）再按内容重算
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
  }

  // 最小化：缩成「状态板」——不显示聊天内容，只显示进度（思考中/执行中/待确认/空闲）+ 会话别名。
  // 仍可拖动 / 点击展开；有未决决策仍渲染弹框。
  if (minimized && giftMode) {
    return (
      <>
        <button
          type="button"
          onPointerDown={onBubbleDown}
          onPointerMove={onBubbleMove}
          onPointerUp={onBubbleUp}
          aria-label={`礼赠助手 ${status}，点击展开，长按说话`}
          title={`礼赠助手 · ${status}（点击展开 · 长按说话）`}
          className="fixed z-50 cursor-move touch-none rounded-full p-0 transition-transform hover:scale-105 active:scale-95"
          style={{ left: pos.x, top: pos.y }}
        >
          {bubbleListening ? (
            <span className="flex size-16 items-center justify-center rounded-full bg-[#79a861]/25 ring-2 ring-[#79a861]">
              <Mic className="size-7 animate-pulse text-[#79a861]" />
            </span>
          ) : bubbleRecBusy ? (
            <span className="flex size-16 items-center justify-center rounded-full bg-black/55">
              <Loader2 className="size-6 animate-spin text-[#79a861]" />
            </span>
          ) : (
            <>
              <img
                src={conciergeSrc}
                alt="礼赠助手"
                draggable={false}
                className={`size-16 select-none object-contain drop-shadow-[0_10px_22px_rgba(111,155,84,0.5)] ${active ? 'animate-pulse' : ''}`}
              />
              {pending && (
                <span className="absolute right-1 top-1 size-2.5 rounded-full bg-[#79a861] ring-2 ring-[#08130d]" aria-hidden />
              )}
            </>
          )}
        </button>
        {dialogs}
      </>
    )
  }

  if (minimized) {
    return (
      <>
        <button
          type="button"
          onPointerDown={onBubbleDown}
          onPointerMove={onBubbleMove}
          onPointerUp={onBubbleUp}
          aria-label={`${headerTitle} ${status}，点击展开，长按说话`}
          title={`${headerTitle} · ${status}（拖动移动 · 点击展开 · 长按说话）`}
          className="fixed z-50 flex max-w-[72vw] cursor-move touch-none items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] py-1.5 pl-2 pr-3.5 text-left shadow-lg"
          style={{ left: pos.x, top: pos.y }}
        >
          {bubbleListening ? (
            <>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                <Mic className="size-4 animate-pulse" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium leading-tight">正在听…</span>
                <span className="block truncate text-[11px] leading-tight text-[var(--color-muted-foreground)]">松开发送 · {bubbleRec.seconds}s</span>
              </span>
            </>
          ) : bubbleRecBusy ? (
            <>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <Loader2 className="size-4 animate-spin" />
              </span>
              <span className="block truncate text-xs leading-tight text-[var(--color-muted-foreground)]">识别中…</span>
            </>
          ) : (
            <>
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${active
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}>
                {active ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium leading-tight">{headerTitle}</span>
                <span className={`block truncate text-[11px] leading-tight ${pending
                  ? 'font-medium text-amber-600 dark:text-amber-400'
                  : 'text-[var(--color-muted-foreground)]'}`}>
                  {engineLabel} · {status}
                </span>
              </span>
            </>
          )}
        </button>
        {dialogs}
      </>
    )
  }

  const autoHeight = compact && !showSessions // 迷你态：高度随内容自适应（不铺消息流）
  const hoverClass = giftMode ? 'hover:bg-white/10' : 'hover:bg-[var(--color-background)]'
  return (
    <div
      className={giftMode
        ? 'fixed z-50 flex flex-col overflow-hidden rounded-[1.5rem] border border-[#6f9b54]/28 bg-[#08130d]/94 text-white shadow-[0_24px_80px_-28px_rgba(111,155,84,0.85)] backdrop-blur-2xl'
        : 'fixed z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_8px_30px_-6px_rgba(0,0,0,0.18)]'}
      style={{ left: pos.x, top: pos.y, width: size.w, height: autoHeight ? undefined : size.h, maxHeight: autoHeight ? '70vh' : undefined }}
    >
      {/* 顶部品牌色细线：标识「这是 AI 助手」，而非整窗染色（方案3：同色系分层 + 品牌色点缀） */}
      <div className={`h-[3px] w-full shrink-0 ${giftMode ? 'bg-[#6f9b54]' : 'bg-[var(--color-primary)]'}`} />
      {/* 标题栏 = 拖拽手柄。迷你态：状态 + 关键控制（仿音乐小卡片，只一行）；完整态：别名/引擎/全部按钮。 */}
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`flex cursor-move touch-none items-center gap-2 border-b px-3 py-2 select-none ${giftMode ? 'border-[#6f9b54]/16 bg-[#0e1a12]/95' : 'border-[var(--color-border)] bg-[var(--color-muted)]'}`}
      >
        {giftMode ? (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#6f9b54]/35 bg-[#0e1a12]">
              <img src={conciergeSrc} alt="" className="size-9 object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[#eaf2dc]" title={headerTitle}>礼赠助手</span>
              <span className={`block truncate text-[11px] ${pending ? 'font-medium text-[#79a861]' : 'text-white/45'}`}>
                {status === '空闲' ? '我在这里陪你完成签收' : status}
              </span>
            </span>
          </>
        ) : compact ? (
          <>
            {active
              ? <Loader2 className="size-4 shrink-0 animate-spin text-[var(--color-primary)]" />
              : <MessageSquare className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />}
            <span className={`min-w-0 flex-1 truncate text-sm ${pending ? 'font-medium text-amber-600 dark:text-amber-400' : ''}`} title={`${headerTitle} · ${status}`}>{status}</span>
          </>
        ) : (
          <>
            <MessageSquare className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={headerTitle}>{headerTitle}</span>
            <span
              title={engineTitle}
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${chat.currentProviderKind === 'thirdParty'
                ? 'border border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-[var(--color-background)] text-[var(--color-muted-foreground)]'}`}
            >{engineLabel}</span>
          </>
        )}
        <div className="flex shrink-0 gap-0.5">
          {onShowcase && !demo && (
            <>
              <button type="button" onClick={() => navigate('/')} aria-label="返回工作台" title="返回工作台"
                className={`rounded p-1 ${hoverClass}`}>
                <LayoutGrid className="size-4" />
              </button>
              <ThemeMenu dense />
              <span className="mx-0.5 w-px self-stretch bg-[var(--color-border)]" aria-hidden />
            </>
          )}
          {!compact && !demo && (
            <>
              <button type="button" onClick={() => { chat.open(''); setShowSessions(false) }} aria-label="新建会话" title="新建会话（home 目录）"
                className={`rounded p-1 ${hoverClass}`}>
                <Plus className="size-4" />
              </button>
              <button type="button" onClick={() => setShowSessions(s => !s)} aria-label="会话列表" title="切换会话"
                className={`rounded p-1 ${hoverClass} ${showSessions ? (giftMode ? 'bg-white/10' : 'bg-[var(--color-background)]') : ''}`}>
                <List className="size-4" />
              </button>
              {chat.sessionId && (
                <button type="button" onClick={() => chat.resumeCurrent()} aria-label="重载会话" title="重载会话（重连原生会话，加载最新插件/技能/命令）"
                  className={`rounded p-1 ${hoverClass}`}>
                  <RotateCw className="size-4" />
                </button>
              )}
            </>
          )}
          {!showSessions && !demo && (
            <button type="button" onClick={() => setCompact(c => !c)}
              aria-label={compact ? '展开完整对话' : '收起为迷你'} title={compact ? '展开看完整对话' : '收起为迷你（只看状态）'}
              className={`rounded p-1 ${hoverClass}`}>
              {compact ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </button>
          )}
          {!demo && (
            <button type="button" onClick={() => setVoiceMode(true)} aria-label="语音模式" title="白云·纯语音对话"
              className={`rounded p-1 ${hoverClass}`}>
              <Cloud className="size-4" />
            </button>
          )}
          {!demo && (
            <button type="button" onClick={() => navigate(CHAT_ROUTE)} aria-label="展开为全屏" title="展开为全屏"
              className={`rounded p-1 ${hoverClass}`}>
              <Maximize2 className="size-4" />
            </button>
          )}
          <button type="button" onClick={() => setMinimized(true)} aria-label="最小化" title="最小化"
            className={`rounded p-1 ${hoverClass}`}>
            <Minus className="size-4" />
          </button>
          {!demo && (
            <button type="button" onClick={() => setFloating(false)} aria-label="关闭悬浮窗" title="关闭"
              className={`rounded p-1 ${hoverClass}`}>
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {/* 权限模式 + 自动允许：仅完整态、非会话列表（迷你态隐藏，保持简洁）。demo 受约束沙箱无人审批，隐藏。 */}
      {!compact && !showSessions && !demo && (
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <button
            type="button"
            onClick={cycleMode}
            title="点击切换权限模式：默认 → 自动接受 → 计划 → 全自动（下一轮生效）"
            className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${chat.mode === 'bypassPermissions'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
              : 'text-[var(--color-muted-foreground)]'}`}
          >
            <Shield className="size-3.5" /> 权限：{MODE_LABELS[chat.mode]}
          </button>
          {chat.mode === 'bypassPermissions' && (
            <button
              type="button"
              onClick={toggleAutoApprove}
              title="全自动下：弹出的权限框自动点「允许」（仅权限框，提问不自动应答）"
              className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${autoApprove
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                : 'text-[var(--color-muted-foreground)]'}`}
            >
              <ShieldCheck className="size-3.5" /> 自动允许·{autoApprove ? '开' : '关'}
            </button>
          )}
        </div>
      )}

      {/* body：仅完整态显示会话列表 / 消息流；迷你态无 body，状态在头部、直接到输入区 */}
      {!compact && (showSessions ? (
        <div className="flex-1 overflow-y-auto">
          <SessionList
            currentSessionId={chat.sessionId}
            onSwitch={id => { chat.switchTo(id); setShowSessions(false) }}
          />
        </div>
      ) : (
        <MessageList items={chat.items} running={chat.running} onFork={chat.forkSession} engineLabel={engineLabel} onResumeCurrent={chat.resumeCurrent} turnTokens={chat.turnTokens} connState={chat.state} />
      ))}

      {/* 模块路由面板：解析中 / 没匹配提示 / 多候选选择（说「去开发 X 模块」或 /goto X 触发） */}
      {(routeBusy || routeNote || routeCands) && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs">
          {routeBusy && (
            <div className="flex items-center gap-2 text-[var(--color-muted-foreground)]"><Loader2 className="size-3.5 animate-spin" /> 解析模块中…</div>
          )}
          {!routeBusy && routeNote && (
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <Compass className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{routeNote}</span>
              <button type="button" onClick={() => setRouteNote(null)} className="shrink-0 rounded px-1 hover:bg-[var(--color-background)]">知道了</button>
            </div>
          )}
          {!routeBusy && routeCands && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[var(--color-muted-foreground)]">
                <Compass className="size-3.5" /> 匹配到多个，去哪个？
                <button type="button" onClick={() => setRouteCands(null)} className="ml-auto rounded px-1 hover:bg-[var(--color-background)]">取消</button>
              </div>
              <div className="flex flex-col gap-1">
                {routeCands.map(c => (
                  <button
                    key={`${c.projectPath}|${c.module.absPath}`}
                    type="button"
                    onClick={() => launchModule(c)}
                    className="rounded-md border px-2 py-1.5 text-left hover:border-[var(--color-primary)] hover:bg-[var(--color-background)]"
                  >
                    <span className="font-medium">{c.module.name}</span>
                    <span className="ml-1 text-[10px] text-[var(--color-muted-foreground)]">{c.project}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 迷你态输入：只一个语音按钮，识别后直接发送（不显示输入框/发送按钮，最简） */}
      {!showSessions && compact && (
        <div className={`border-t p-2.5 ${giftMode ? 'border-[#6f9b54]/14 bg-[#0e1a12]/95' : 'border-[var(--color-border)] bg-[var(--color-muted)]'}`}>
          {chat.running ? (
            <div className="flex items-center justify-center gap-3 text-xs text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" /> 处理中…
              <button type="button" onClick={chat.interrupt} aria-label="中断"
                className="rounded-lg border px-3 py-1 text-xs">中断</button>
            </div>
          ) : (
            <MiniVoiceBar onSend={t => { if (!handleUserText(t)) chat.send(t) }} />
          )}
        </div>
      )}

      {/* 完整态输入区（会话列表展开时隐藏） */}
      {!showSessions && !compact && (
      <div className={`border-t ${giftMode ? 'border-[#6f9b54]/14 bg-[#0e1a12]/95' : 'border-[var(--color-border)] bg-[var(--color-muted)]'}`}>
        {(attachments.length > 0 || uploading > 0) && (
          <AttachmentChips
            items={attachments}
            uploading={uploading}
            onRemove={id => setAttachments(prev => {
              const t = prev.find(a => a.id === id)
              if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl)
              return prev.filter(a => a.id !== id)
            })}
          />
        )}
        <div className="flex items-end gap-2 p-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={e => { void uploadFiles(e.target.files); e.target.value = '' }}
          />
          {!demo && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={chat.running || attachments.length + uploading >= MAX_ATTACHMENTS}
              aria-label="上传附件"
              title={attachments.length + uploading >= MAX_ATTACHMENTS ? `最多 ${MAX_ATTACHMENTS} 个附件` : '上传附件（也可直接粘贴图片）'}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border disabled:opacity-50 ${giftMode ? 'border-white/12 text-white/55 hover:bg-white/10' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-background)]'}`}
            >
              <Paperclip className="size-4" />
            </button>
          )}
          {!demo && (
            <VoiceInputButton
              disabled={chat.running}
              onText={t => setDraft(d => (d.trim() ? `${d} ${t}` : t))}
            />
          )}
          <textarea
            ref={taRef}
            className={`max-h-24 min-h-[2.25rem] flex-1 resize-none overflow-y-auto rounded-lg border px-2 py-1.5 text-sm ${giftMode ? 'border-white/12 bg-white/8 text-white placeholder:text-white/28' : 'bg-[var(--color-background)]'}`}
            placeholder="发消息 / 粘贴图片…（/goto 模块 或「去开发 X」可跳转）"
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return; e.preventDefault(); submit() } }}
          />
          {chat.running ? (
            <button type="button" onClick={chat.interrupt} aria-label="中断"
              className="rounded-lg border px-3 py-2 text-sm">中断</button>
          ) : (
            <button type="button" onClick={submit} disabled={!draft.trim() && attachments.length === 0} aria-label="发送"
              className={`rounded-lg px-3 py-2 disabled:opacity-50 ${giftMode ? 'bg-[#79a861] text-[#0c160c] hover:bg-[#9bc16e]' : 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'}`}>
              <Send className="size-4" />
            </button>
          )}
        </div>
      </div>
      )}

      {/* 右下角缩放手柄（仅完整态，迷你态高度自适应无需缩放） */}
      {!autoHeight && (
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        title="拖拽调整大小"
        className="absolute bottom-0 right-0 z-10 size-4 cursor-nwse-resize touch-none"
      >
        <svg viewBox="0 0 10 10" className="absolute bottom-[3px] right-[3px] size-2.5 text-[var(--color-muted-foreground)]">
          <path d="M9 1 L1 9 M9 5 L5 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </div>
      )}

      {dialogs}
    </div>
  )
}
