import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, CircleAlert, Link2, Loader2, Paperclip, RotateCw, ShieldCheck, Square } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { http } from '@/lib/api'
import { createSessionClient, type ConnectionState, type PublicMessage, type PublicSession, type SessionClientEvent } from '@/session-client-sdk'

const TOKEN_KEY = 'kai-session-client:access-token'

export function SessionClientPage() {
  const [params] = useSearchParams()
  const [invitation, setInvitation] = useState(params.get('invitation') ?? '')
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '')
  const [session, setSession] = useState<PublicSession | null>(null)
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [question, setQuestion] = useState<{ requestId: string; questions: Array<{ question: string }> } | null>(null)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<{ id: string; name: string; mime: string } | null>(null)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [busy, setBusy] = useState(false)
  const tokenRef = useRef(accessToken)
  const destroyTimerRef = useRef<number | undefined>(undefined)
  tokenRef.current = accessToken
  const client = useMemo(() => createSessionClient({ requestBaseUrl: '', getAccessToken: () => tokenRef.current }), [])

  useEffect(() => {
    if (destroyTimerRef.current !== undefined) window.clearTimeout(destroyTimerRef.current)
    const stopState = client.subscribeState(setConnection)
    const stopEvents = client.subscribe(handleEvent)
    if (accessToken) void connect()
    return () => {
      stopState()
      stopEvents()
      // React StrictMode 会立即重放 effect；延迟销毁可让重放先取消该定时器。
      destroyTimerRef.current = window.setTimeout(() => client.destroy(), 0)
    }
  }, [])

  async function connect() {
    setBusy(true); setError(''); setErrorCode('')
    try {
      const [summary, history] = await Promise.all([client.connect(), client.loadHistory(undefined, 50)])
      setSession(summary); setMessages(history.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '连接失败')
      setErrorCode(errorCodeOf(cause))
    }
    finally { setBusy(false) }
  }

  function handleEvent(event: SessionClientEvent) {
    if (event.type === 'message' && event.data) {
      const data = event.data as { role: 'user' | 'assistant'; text: string; messageId?: string }
      setMessages(current => appendMessage(current, data.role, data.text, data.messageId))
    } else if (event.type === 'businessQuestion' && event.data) {
      setQuestion(event.data as typeof question)
    } else if (event.type === 'progress' && event.data) {
      setSession(current => current ? { ...current, progress: event.data as PublicSession['progress'] } : current)
    } else if (event.type === 'replayGap') {
      setErrorCode('REPLAY_GAP')
      setError('部分实时消息已离开回放窗口，正在重新同步会话历史。')
      void client.loadHistory(undefined, 50)
        .then(history => { setMessages(history.items); setError(''); setErrorCode('') })
        .catch(cause => setError(cause instanceof Error ? cause.message : '历史同步失败'))
    } else if (event.error) {
      setError(event.error.message)
      setErrorCode(event.error.code)
    }
  }

  async function exchange() {
    if (!invitation.trim()) return
    setBusy(true); setError(''); setErrorCode('')
    try {
      const result = await http<{ accessToken: string }>('/session-client/v1/invitations/exchange', {
        method: 'POST', body: JSON.stringify({ invitationCode: invitation.trim() }),
      })
      sessionStorage.setItem(TOKEN_KEY, result.accessToken)
      setAccessToken(result.accessToken); tokenRef.current = result.accessToken
      await connect()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '邀请码兑换失败')
      setErrorCode(errorCodeOf(cause))
    }
    finally { setBusy(false) }
  }

  async function send() {
    const text = draft.trim()
    if (!text && !attachment) return
    setDraft(''); setError(''); setErrorCode('')
    try {
      await client.send({ text, attachments: attachment ? [attachment] : [] })
      setMessages(current => appendMessage(current, 'user', text, crypto.randomUUID()))
      setAttachment(null)
    } catch (cause) {
      setDraft(text); setError(cause instanceof Error ? cause.message : '发送失败')
      setErrorCode(errorCodeOf(cause))
    }
  }

  async function upload(file?: File) {
    if (!file) return
    setBusy(true); setError(''); setErrorCode('')
    try { setAttachment(await client.upload(file)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '附件上传失败'); setErrorCode(errorCodeOf(cause)) }
    finally { setBusy(false) }
  }

  if (!session) {
    const guidance = issueGuidance(errorCode)
    return <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-5 py-12">
      <div className="border-b border-[var(--color-border)] pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">Forge delegated session</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">连接受约束开发会话</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">使用会话所有者提供的单次邀请码。你只能影响这一条绑定会话，风险操作仍由所有者批准。</p>
      </div>
      <label className="mt-6 grid gap-2 text-sm font-medium">单次邀请码
        <input value={invitation} onChange={event => setInvitation(event.target.value)} autoComplete="one-time-code"
          className="h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />
      </label>
      {error && <div role="alert" className="mt-3 border-l-2 border-amber-400 pl-3 text-sm">
        <p className="flex gap-2 font-medium text-amber-900"><CircleAlert className="mt-0.5 size-4 shrink-0" />{guidance.title}</p>
        <p className="mt-1 text-[var(--color-muted-foreground)]">{error} {guidance.recovery}</p>
      </div>}
      <Button className="mt-5 self-start" onClick={() => void (accessToken ? connect() : exchange())} disabled={busy || (!accessToken && !invitation.trim())}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />}{accessToken ? '重新连接' : '验证并连接'}
      </Button>
      {accessToken && ['AUTHENTICATION_REQUIRED', 'GRANT_EXPIRED', 'GRANT_REVOKED'].includes(errorCode) &&
        <button className="mt-3 self-start text-sm underline underline-offset-4" onClick={() => {
          sessionStorage.removeItem(TOKEN_KEY); setAccessToken(''); tokenRef.current = ''; setError(''); setErrorCode('')
        }}>使用新的邀请码</button>}
    </main>
  }

  const progress = session.progress
  return <main className="mx-auto flex h-full w-full max-w-5xl flex-col px-3 sm:px-6">
    <header className="flex flex-wrap items-center gap-4 border-b border-[var(--color-border)] py-4">
      <div className="min-w-0 flex-1"><p className="truncate text-base font-semibold">{session.title || '受约束开发会话'}</p><p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{session.profile === 'DELEGATED_DEVELOPMENT' ? '受约束开发' : '仅提交需求'} · {session.usedTurns}/{session.maxTurns} 轮</p></div>
      <span className={`inline-flex items-center gap-1.5 text-xs ${connection === 'connected' ? 'text-emerald-700' : 'text-amber-700'}`}><span className="size-1.5 rounded-full bg-current" />{connectionLabel(connection)}</span>
      <ShieldCheck className="size-4 text-[var(--color-muted-foreground)]" aria-label="风险操作由会话所有者批准" />
    </header>
    {progress && <div className="border-b border-[var(--color-border)] py-2 text-xs text-[var(--color-muted-foreground)]" aria-live="polite">{progress.phase || progress.state || '执行中'}{progress.currentTaskId ? ` · ${progress.currentTaskId}` : ''}{progress.totalTasks ? ` · ${progress.completedTasks}/${progress.totalTasks}` : ''}</div>}
    {error && <div role="alert" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><CircleAlert className="size-4" /><span><strong>{issueGuidance(errorCode).title}：</strong>{error}</span>{issueGuidance(errorCode).retry && <button className="ml-auto shrink-0 underline" onClick={() => void connect()}>重试连接</button>}</div>}
    <section className="min-h-0 flex-1 overflow-y-auto py-5" aria-label="会话消息">
      <div className="space-y-5">{messages.map(message => <article key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[85%] rounded-lg bg-[var(--color-accent)] px-3 py-2.5 text-sm' : 'max-w-3xl text-sm leading-7'}><p className="whitespace-pre-wrap">{message.text}</p></article>)}</div>
    </section>
    {question && <section className="border-t border-amber-200 bg-amber-50 px-3 py-3"><p className="text-sm font-medium">Agent 需要业务确认</p>{question.questions.map(item => <button key={item.question} className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-left text-sm" onClick={() => void client.answerQuestion(question.requestId, { [item.question]: '确认' }).then(() => setQuestion(null))}>{item.question}<span className="ml-3 text-xs text-amber-700">确认</span></button>)}</section>}
    {attachment && <div className="border-t border-[var(--color-border)] py-2 text-xs text-[var(--color-muted-foreground)]">附件：{attachment.name}</div>}
    <footer className="border-t border-[var(--color-border)] py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-2 focus-within:ring-2 focus-within:ring-[var(--color-ring)]">
        <label className="cursor-pointer rounded p-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="添加附件"><Paperclip className="size-4" /><input type="file" className="sr-only" onChange={event => void upload(event.target.files?.[0])} /></label>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2} placeholder="描述需要调整的业务细节…" className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none" />
        {connection === 'connected' ? <Button size="icon" onClick={() => void send()} aria-label="发送"><ArrowUp className="size-4" /></Button> : <Button size="icon" variant="outline" onClick={() => void connect()} aria-label="重新连接"><RotateCw className="size-4" /></Button>}
        <Button size="icon" variant="ghost" onClick={() => void client.interrupt()} aria-label="中断自己的回合"><Square className="size-3.5" /></Button>
      </div>
    </footer>
  </main>
}

function appendMessage(current: PublicMessage[], role: 'user' | 'assistant', text: string, id?: string): PublicMessage[] {
  const last = current.at(-1)
  if (role === 'assistant' && last?.role === 'assistant') return [...current.slice(0, -1), { ...last, text: last.text + text }]
  return [...current, { id: id || crypto.randomUUID(), role, text }]
}

function connectionLabel(state: ConnectionState) {
  return ({ idle: '未连接', connecting: '连接中', connected: '已连接', offline: '本机离线，自动重试', terminal: '授权已失效' })[state]
}

function errorCodeOf(cause: unknown): string {
  return cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' ? cause.code : 'SERVER_ERROR'
}

function issueGuidance(code: string): { title: string; recovery: string; retry: boolean } {
  switch (code) {
    case 'GRANT_PAUSED': return { title: '会话已由所有者暂停', recovery: '所有者恢复授权后可重新连接。', retry: true }
    case 'GRANT_EXPIRED': return { title: '会话授权已过期', recovery: '请向所有者申请新的邀请。', retry: false }
    case 'GRANT_REVOKED': return { title: '参与者访问已撤销', recovery: '如仍需协作，请由所有者重新授权。', retry: false }
    case 'REPLAY_GAP': return { title: '正在恢复消息历史', recovery: '客户端会重新读取可见历史。', retry: true }
    case 'LIMIT_EXCEEDED': return { title: '本次授权额度已用完', recovery: '请等待所有者调整额度或重新授权。', retry: false }
    case 'HOST_OFFLINE': return { title: '本机 Forge 暂时离线', recovery: '保持页面打开，服务恢复后重试。', retry: true }
    case 'AUTHENTICATION_REQUIRED': return { title: '授权凭证已失效', recovery: '请使用新的单次邀请码。', retry: false }
    default: return { title: '暂时无法连接会话', recovery: '请稍后重试；若持续失败，请联系会话所有者。', retry: true }
  }
}
