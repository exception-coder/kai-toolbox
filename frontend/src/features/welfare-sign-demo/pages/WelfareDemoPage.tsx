import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Minus, Send, Sparkles, User, Wrench } from 'lucide-react'
import { http } from '@/lib/api'
import { cn } from '@/lib/utils'
import { WelfareSignPage } from '@/features/welfare-sign/pages/WelfareSignPage'
import type { WelfareConfig } from '@/features/welfare-sign/types'

type Status = 'connecting' | 'ready' | 'closed' | 'error'
interface ChatItem {
  role: 'user' | 'assistant'
  text: string
}
type Pos = { x: number; y: number }

const PANEL_W = 380
const PANEL_H = 560
const BAR_H = 52

/** 拉不到副本配置时的兜底端午皮肤，保证页面不空白。 */
const FALLBACK_CONFIG: WelfareConfig = {
  loginMode: 'SMS',
  redirectUrl: null,
  loginImageUrl: null,
  detailImageUrl: null,
  detailTitle: '端午安康',
  detailContent: '粽叶飘香，端午将至，一份来自公司的心意已为你备好。请确认收取，并留下你的签名。',
  popupEnabled: true,
  popupTitle: '一份端午的心意',
  popupContent: '请在确认福利品信息后完成签名。',
  signatureNotice: '本人确认已收到本次端午节福利品。',
  extraFieldsJson: null,
  updatedAt: Date.now(),
}

/**
 * 福利签收「免登录受约束 Vibe Coding 演示」。
 *
 * 背景 = 真实 {@link WelfareSignPage}（fullscreen，配置取自本会话一次性副本库）；前景是一个**拟物风格、
 * 可拖拽、可缩小/展开**的 vibe coding 对话框。免登录访客在框里让 AI 改本页文案，AI 经受约束的 welfare_db
 * 工具改副本库 welfare_sign_config，本轮结束后页面自动重拉配置即时反映。改动只作用于副本，真实环境零影响。
 */
export function WelfareDemoPage() {
  const [status, setStatus] = useState<Status>('connecting')
  const [config, setConfig] = useState<WelfareConfig>(FALLBACK_CONFIG)
  const [configVersion, setConfigVersion] = useState(0)
  const [items, setItems] = useState<ChatItem[]>([])
  const [streaming, setStreaming] = useState('')
  const [running, setRunning] = useState(false)
  const [input, setInput] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef('')
  const sessionRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)

  // 初始落到右下角。
  useLayoutEffect(() => {
    if (pos) return
    setPos({ x: window.innerWidth - PANEL_W - 20, y: window.innerHeight - PANEL_H - 20 })
  }, [pos])

  async function refetchConfig() {
    const sid = sessionRef.current
    if (!sid) return
    try {
      const c = await http<WelfareConfig>(`/claude-chat/demo/welfare-config/${sid}`)
      setConfig(c)
      setConfigVersion((v) => v + 1)
    } catch {
      /* 无行/未就绪：保留当前配置，下轮再试 */
    }
  }

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/api/claude-chat/demo/ws`)
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'open' }))
    ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'closed'))
    ws.onerror = () => setStatus('error')
    ws.onmessage = (ev) => {
      let m: Record<string, unknown>
      try {
        m = JSON.parse(ev.data)
      } catch {
        return
      }
      switch (m.type as string) {
        case 'ready':
          setStatus('ready')
          if (typeof m.sessionId === 'string') {
            sessionRef.current = m.sessionId
            void refetchConfig()
          }
          break
        case 'assistantDelta':
          streamRef.current += (m.text as string) ?? ''
          setStreaming(streamRef.current)
          break
        case 'result': {
          const text = streamRef.current
          streamRef.current = ''
          setStreaming('')
          setRunning(false)
          if (text.trim()) setItems((prev) => [...prev, { role: 'assistant', text }])
          void refetchConfig()
          break
        }
        case 'error':
          setBanner((m.message as string) ?? '出错了')
          setRunning(false)
          break
        default:
          break
      }
    }
    return () => ws.close()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items, streaming])

  function send() {
    const text = input.trim()
    const ws = wsRef.current
    if (!text || !ws || ws.readyState !== WebSocket.OPEN || running) return
    setItems((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setBanner(null)
    streamRef.current = ''
    setStreaming('')
    setRunning(true)
    ws.send(JSON.stringify({ type: 'send', text }))
  }

  // —— 拖拽（标题栏为握把）——
  const clamp = (x: number, y: number): Pos => {
    const h = minimized ? BAR_H : PANEL_H
    return {
      x: Math.min(Math.max(8, x), window.innerWidth - PANEL_W - 8),
      y: Math.min(Math.max(8, y), window.innerHeight - h - 8),
    }
  }
  const onBarDown = (e: React.PointerEvent) => {
    if (!pos) return
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onBarMove = (e: React.PointerEvent) => {
    if (!dragOffset.current) return
    setPos(clamp(e.clientX - dragOffset.current.dx, e.clientY - dragOffset.current.dy))
  }
  const onBarUp = (e: React.PointerEvent) => {
    dragOffset.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <WelfareSignPage key={configVersion} fullscreen demoConfig={config} />

      {/* 拟物风格可拖拽窗口 */}
      <div
        style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, width: PANEL_W, visibility: pos ? 'visible' : 'hidden' }}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden rounded-2xl text-white select-none',
          // 拟物层次：双向渐变 + 外阴影 + 内高光 + 描边
          'border border-[#2c4434] bg-gradient-to-b from-[#17281d] to-[#0a130d]',
          'shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8),0_2px_0_rgba(255,255,255,0.04)_inset]',
          'ring-1 ring-black/50',
        )}
      >
        {/* 标题栏（握把）：木纹般的渐变 + 顶部高光 */}
        <div
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          style={{ touchAction: 'none', height: BAR_H }}
          className={cn(
            'flex shrink-0 cursor-grab items-center gap-2.5 px-3 active:cursor-grabbing',
            'border-b border-black/45 bg-gradient-to-b from-[#2a4231] to-[#1b2c20]',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
          )}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-b from-[#79a861] to-[#4d7339] text-[#0c160c] shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_1px_2px_rgba(0,0,0,0.5)]">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight tracking-wide">Vibe Coding · 受约束演示</p>
            {!minimized && (
              <p className="truncate text-[11px] text-white/45">免登录 · 只能改本页文案（副本沙箱）· {statusLabel(status)}</p>
            )}
          </div>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMinimized((v) => !v)}
            title={minimized ? '展开' : '缩小'}
            className="flex size-6 items-center justify-center rounded-full bg-white/10 text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-white/20 hover:text-white"
          >
            {minimized ? <Sparkles className="size-3.5" /> : <Minus className="size-3.5" />}
          </button>
        </div>

        {!minimized && (
          <>
            {banner && <div className="bg-rose-500/15 px-4 py-2 text-xs text-rose-300">{banner}</div>}

            <div className="flex-1 space-y-3 overflow-y-auto p-3" style={{ height: PANEL_H - BAR_H - 64 }}>
              {items.length === 0 && !streaming && (
                <p className="px-1 py-6 text-center text-xs leading-5 text-white/45">
                  试试对我说：
                  <br />「把大标题改成『中秋福利签收』」
                  <br />「把正文改成中秋祝福语」
                  <br />「打开签收弹框并改个标题」
                </p>
              )}
              {items.map((it, i) => (
                <Bubble key={i} role={it.role}>
                  {it.text}
                </Bubble>
              ))}
              {running && (
                <Bubble role="assistant">
                  {streaming ? (
                    <span className="whitespace-pre-wrap break-words">{streaming}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-white/60">
                      <Wrench className="size-3.5 animate-pulse" /> 正在修改演示页…
                    </span>
                  )}
                </Bubble>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-black/40 bg-black/20 p-2.5">
              <textarea
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-white/12 bg-white/8 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-[#6f9b54]/70 disabled:opacity-50"
                rows={1}
                placeholder={status === 'ready' ? '让 AI 改改这个页面…（Enter 发送）' : '正在连接演示环境…'}
                value={input}
                disabled={status !== 'ready'}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <button
                disabled={status !== 'ready' || running}
                onClick={send}
                title="发送"
                className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-b from-[#79a861] to-[#4d7339] text-[#0c160c] shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_2px_4px_rgba(0,0,0,0.5)] hover:from-[#8bbb71] disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-[#5e8b46] text-[#0c160c]' : 'bg-white/10 text-white',
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-6',
          isUser ? 'bg-[#5e8b46] text-[#0c160c]' : 'bg-white/8 text-white/90',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function statusLabel(s: Status): string {
  return s === 'connecting' ? '连接中' : s === 'ready' ? '已就绪' : s === 'closed' ? '已断开' : '连接失败'
}
