import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Sparkles, User, Wrench, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { http } from '@/lib/api'
import { cn } from '@/lib/utils'
import { WelfareSignPage } from '@/features/welfare-sign/pages/WelfareSignPage'
import type { WelfareConfig } from '@/features/welfare-sign/types'

type Status = 'connecting' | 'ready' | 'closed' | 'error'
interface ChatItem {
  role: 'user' | 'assistant'
  text: string
}

/** 演示页拉不到配置（库无行/会话未就绪）时的兜底端午皮肤，保证页面不空白。 */
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
 * 背景 = 真实 {@link WelfareSignPage}（fullscreen），但配置来自本演示会话的一次性副本库；右下角悬浮
 * 一个 vibe coding 对话框（默认展开）。免登录访客在对话框里让 AI 改演示页文案，AI 经受约束的 welfare_db
 * 工具改副本库的 welfare_sign_config，本轮结束后页面自动重拉配置、即时反映。改动只作用于副本，真实环境零影响。
 */
export function WelfareDemoPage() {
  const [status, setStatus] = useState<Status>('connecting')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [config, setConfig] = useState<WelfareConfig>(FALLBACK_CONFIG)
  const [configVersion, setConfigVersion] = useState(0)
  const [items, setItems] = useState<ChatItem[]>([])
  const [streaming, setStreaming] = useState('')
  const [running, setRunning] = useState(false)
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef('')
  const sessionRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function refetchConfig() {
    const sid = sessionRef.current
    if (!sid) return
    try {
      const c = await http<WelfareConfig>(`/claude-chat/demo/welfare-config/${sid}`)
      setConfig(c)
      setConfigVersion((v) => v + 1)
    } catch {
      /* 无行/未就绪：保留当前配置，下一轮再试 */
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
            setSessionId(m.sessionId)
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
          void refetchConfig() // agent 改完配置 → 重拉 → 演示页即时反映
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

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      {/* 背景：真实福利签收页，配置来自副本库；configVersion 变化即重挂载刷新 */}
      <WelfareSignPage key={configVersion} fullscreen demoConfig={config} />

      {/* 悬浮 Vibe Coding 对话框 */}
      {open ? (
        <div className="fixed bottom-4 right-4 z-50 flex h-[min(70vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e1a12]/95 text-white shadow-2xl backdrop-blur-xl">
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <Sparkles className="size-4 text-[#79a861]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Vibe Coding · 受约束演示</p>
              <p className="truncate text-[11px] text-white/45">
                免登录 · 只能改本页文案（副本沙箱）· {statusLabel(status)}
              </p>
            </div>
            <button className="text-white/50 hover:text-white" onClick={() => setOpen(false)} title="收起">
              <X className="size-4" />
            </button>
          </header>

          {banner && <div className="bg-rose-500/15 px-4 py-2 text-xs text-rose-300">{banner}</div>}

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {items.length === 0 && !streaming && (
              <p className="px-1 py-6 text-center text-xs leading-5 text-white/45">
                试试对我说：<br />「把大标题改成『中秋福利签收』」<br />「把正文改成中秋祝福语」<br />「打开签收弹框并改个标题」
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

          <div className="flex items-end gap-2 border-t border-white/10 p-2.5">
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
            <Button
              size="icon"
              className="bg-[#5e8b46] text-[#0c160c] hover:bg-[#79a861]"
              disabled={status !== 'ready' || running}
              onClick={send}
              title="发送"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-[#5e8b46] px-4 py-3 text-sm font-medium text-[#0c160c] shadow-2xl hover:bg-[#79a861]"
          onClick={() => setOpen(true)}
        >
          <Sparkles className="size-4" /> Vibe Coding
        </button>
      )}
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
