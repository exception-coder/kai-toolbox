import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { MessageCopyButton } from '../components/MessageCopyButton'
import { SharedConversationHeader } from '../components/SharedConversationHeader'
import { useWorkbenchPageTheme, useWorkbenchTheme } from '../lib/workbenchTheme'
import { collaborationPath, getSharedMessages, getSharedSession, type SharedMessage, type SharedSession } from '../sessionSharingApi'

/** 纯文字只读投影，不挂载 ChatPage / WebSocket / Markdown 可执行操作。 */
export function SharedSessionPage() {
  useWorkbenchPageTheme(useWorkbenchTheme())
  const { sessionId = '' } = useParams()
  const [session, setSession] = useState<SharedSession | null>(null)
  const [messages, setMessages] = useState<SharedMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)
  const [warning, setWarning] = useState('')
  const generation = useRef(0)
  const load = useCallback(async (older?: string) => {
    const request = ++generation.current
    setBusy(true); setError(''); setDenied(false)
    try {
      const info = await getSharedSession(sessionId)
      if (generation.current !== request) return
      if (info.id !== sessionId) throw new ApiError(403, null, 'Shared session mismatch')
      setSession(info)
      if (info.collaborate) return
      const page = await getSharedMessages(sessionId, older)
      if (generation.current !== request) return
      setMessages(previous => older ? [...page.items, ...previous].filter((m, i, all) => all.findIndex(x => x.id === m.id) === i) : page.items)
      setCursor(page.nextCursor)
      setWarning(page.transcriptMissing ? '早期会话记录已不可读取。' : page.historyGap ? '部分会话记录不可用。' : '')
    } catch (e) {
      if (generation.current !== request) return
      setSession(null); setMessages([]); setCursor(null); setWarning('')
      const accessDenied = e instanceof ApiError && [401, 403, 404].includes(e.status)
      setDenied(accessDenied)
      setError(accessDenied ? '无法继续访问。请确认登录账号，或联系分享人核对授权。' : '暂时无法读取共享会话，请检查网络后重试。')
    } finally { if (generation.current === request) setBusy(false) }
  }, [sessionId])
  useEffect(() => { setSession(null); setMessages([]); void load(); return () => { generation.current++ } }, [load])

  if (session?.collaborate) return <Navigate replace to={collaborationPath(sessionId)} />

  return <main className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-4xl flex-col overflow-hidden bg-background">
    <SharedConversationHeader title={session?.title} mode={denied ? '无访问权限' : session ? '只读' : '正在核验'}
      onRefresh={session && !busy ? () => void load() : undefined} />
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
      {error && <div className="space-y-3 py-3 text-sm"><p role="alert">{error}</p>
        <Button variant="outline" className="min-h-11" onClick={() => void load()}>重新检查</Button></div>}
      {warning && <p role="status" className="mb-4 text-sm text-muted-foreground">{warning}</p>}
      {cursor && <Button variant="ghost" disabled={busy} onClick={() => void load(cursor)}>加载更早消息</Button>}
      {busy && <p role="status" className="py-3 text-sm">正在读取…</p>}
      {!busy && session && !messages.length && !cursor && !warning && <p className="py-5 text-sm text-muted-foreground">暂无已落盘的对话文字。</p>}
      <ol className="divide-y">{messages.map(message => <li key={message.id} className="min-w-0 py-2.5">
        <p className="mb-1 text-xs text-muted-foreground">{message.kind === 'user' ? '用户' : '助手'}{message.ts ? ` · ${new Date(message.ts).toLocaleString()}` : ''}</p>
        <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{message.text}</p>
        {message.text && <MessageCopyButton text={message.text} label="复制消息" />}
      </li>)}</ol>
    </div>
    {session && <p className="flex shrink-0 items-center gap-2 border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
      <Lock aria-hidden="true" className="size-3.5" /> 此会话仅供查看
    </p>}
  </main>
}
