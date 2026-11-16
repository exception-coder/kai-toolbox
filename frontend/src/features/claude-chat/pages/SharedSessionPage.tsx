import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { getSharedMessages, getSharedSession, type SharedMessage, type SharedSession } from '../sessionSharingApi'

/** 纯文字只读投影，不挂载 ChatPage / WebSocket / Markdown 可执行操作。 */
export function SharedSessionPage() {
  const { sessionId = '' } = useParams()
  const [session, setSession] = useState<SharedSession | null>(null)
  const [messages, setMessages] = useState<SharedMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const generation = useRef(0)
  const load = useCallback(async (older?: string) => {
    const request = ++generation.current
    setBusy(true); setError('')
    try {
      const [info, page] = await Promise.all([getSharedSession(sessionId), getSharedMessages(sessionId, older)])
      if (generation.current !== request) return
      setSession(info)
      setMessages(previous => older ? [...page.items, ...previous].filter((m, i, all) => all.findIndex(x => x.id === m.id) === i) : page.items)
      setCursor(page.nextCursor)
      setWarning(page.transcriptMissing ? '原生历史记录已不可用。' : page.historyGap || '')
    } catch (e) {
      if (generation.current !== request) return
      setSession(null); setMessages([]); setCursor(null); setWarning('')
      setError(e instanceof Error ? e.message : '读取失败，请重新登录或联系会话拥有者')
    } finally { if (generation.current === request) setBusy(false) }
  }, [sessionId])
  useEffect(() => { setSession(null); setMessages([]); void load(); return () => { generation.current++ } }, [load])

  return <main className="mx-auto flex h-full max-w-4xl flex-col px-4 py-5 sm:px-8">
    <header className="shrink-0 border-b pb-4">
      <Link to="/tools/claude-chat" className="text-sm text-muted-foreground hover:underline">返回 Vibe Coding</Link>
      <div className="mt-3 flex items-start justify-between gap-4">
        <h1 className="min-w-0 break-words text-xl font-semibold">{session?.title || '共享会话'}</h1>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>刷新</Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">只读 · 当前引擎已落盘的用户与助手文字。附件、工具日志、其他引擎历史及实时执行片段不在此页展示。</p>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      {error && <div role="alert" className="py-3 text-sm text-destructive">{error}。请重试或联系会话拥有者核对授权。</div>}
      {warning && <p role="status" className="mb-4 text-sm text-muted-foreground">{warning}</p>}
      {cursor && <Button variant="ghost" disabled={busy} onClick={() => void load(cursor)}>加载更早消息</Button>}
      {busy && <p role="status" className="py-3 text-sm">正在读取…</p>}
      {!busy && session && !messages.length && !cursor && !warning && <p className="py-5 text-sm text-muted-foreground">暂无已落盘的对话文字。</p>}
      <ol className="divide-y">{messages.map(message => <li key={message.id} className="py-4">
        <p className="mb-2 text-xs text-muted-foreground">{message.kind === 'user' ? '用户' : '助手'}{message.ts ? ` · ${new Date(message.ts).toLocaleString()}` : ''}</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.text}</p>
      </li>)}</ol>
    </div>
  </main>
}
