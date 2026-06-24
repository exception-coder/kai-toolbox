import { useEffect, useRef, useState } from 'react'
import { Bot, Send, ShieldCheck, User, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Status = 'connecting' | 'ready' | 'closed' | 'error'

interface ChatItem {
  role: 'user' | 'assistant'
  text: string
}

interface ToolEvent {
  name: string
  input?: unknown
  output?: string
  isError?: boolean
}

/**
 * 福利签收受约束 Vibe coding 演示页（showcase，公开免登录）。
 *
 * 自管一条到 /api/claude-chat/demo/ws 的 WebSocket（不带 token）：open 即由后端供给一次性副本沙箱，
 * agent 只能改副本内的 welfare-sign 文件、只能对 welfare_sign_* 表执行 SQL，越界一律被拒。真实环境零影响。
 */
export function WelfareDemoPage() {
  const [status, setStatus] = useState<Status>('connecting')
  const [items, setItems] = useState<ChatItem[]>([])
  const [streaming, setStreaming] = useState('')
  const [tools, setTools] = useState<ToolEvent[]>([])
  const [running, setRunning] = useState(false)
  const [input, setInput] = useState('')
  const [banner, setBanner] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)

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
          break
        case 'assistantDelta':
          streamRef.current += (m.text as string) ?? ''
          setStreaming(streamRef.current)
          break
        case 'toolUse':
          setTools((t) => [...t, { name: m.toolName as string, input: m.input }])
          break
        case 'toolResult':
          setTools((t) => {
            const copy = [...t]
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].name === (m.toolName as string) && copy[i].output === undefined) {
                copy[i] = { ...copy[i], output: m.output as string, isError: Boolean(m.isError) }
                break
              }
            }
            return copy
          })
          break
        case 'result': {
          const text = streamRef.current
          streamRef.current = ''
          setStreaming('')
          setRunning(false)
          setTools([])
          if (text.trim()) setItems((prev) => [...prev, { role: 'assistant', text }])
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
  }, [items, streaming, tools])

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
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-4">
      <header className="flex items-center gap-2 py-4">
        <ShieldCheck className="size-5 text-[var(--color-primary)]" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold">福利签收 · 受约束 Vibe Coding 演示</h1>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            一次性副本沙箱 · 只能改福利签收模块 · 真实环境零影响 · {statusLabel(status)}
          </p>
        </div>
      </header>

      {banner && (
        <div className="mb-2 rounded-md bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {banner}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {items.length === 0 && !streaming && (
          <p className="py-16 text-center text-sm text-[var(--color-muted-foreground)]">
            试试：「把福利签收详情页标题改成『中秋福利签收』」或「给员工表加一条测试数据」
          </p>
        )}
        {items.map((it, i) => (
          <Bubble key={i} role={it.role}>
            {it.text}
          </Bubble>
        ))}
        {running && (
          <Bubble role="assistant">
            {tools.length > 0 && (
              <div className="mb-2 space-y-1">
                {tools.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                    <Wrench className="size-3.5 shrink-0" />
                    <code className="rounded bg-[var(--color-muted)] px-1">{t.name}</code>
                    {t.output !== undefined && <span>{t.isError ? '✗' : '✓'}</span>}
                  </div>
                ))}
              </div>
            )}
            <span className="whitespace-pre-wrap break-words">{streaming}</span>
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
          </Bubble>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t py-3">
        <textarea
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
          rows={1}
          placeholder={status === 'ready' ? '让 AI 改改福利签收模块…（Enter 发送）' : '正在连接演示环境…'}
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
        <Button size="icon" disabled={status !== 'ready' || running} onClick={send} title="发送">
          <Send />
        </Button>
      </div>
    </div>
  )
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user'
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
          'max-w-[78%] rounded-2xl px-4 py-2 text-sm',
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

function statusLabel(s: Status): string {
  switch (s) {
    case 'connecting':
      return '连接中'
    case 'ready':
      return '已就绪'
    case 'closed':
      return '已断开'
    case 'error':
      return '连接失败'
  }
}
