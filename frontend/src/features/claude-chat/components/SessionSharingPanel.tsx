import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import {
  grantSessionReader, listSessionReaders, listSharedSessions, revokeSessionReader,
  collaborationPath, searchSessionRecipients, sharedSessionPath, type SessionReader, type SessionReaderGrant, type SharedSession,
} from '../sessionSharingApi'

export function SessionSharingPanel({ sessionId, sessionTitle, onClose, returnFocus, onSharingChange }: {
  sessionId?: string; sessionTitle?: string; onClose: () => void; returnFocus?: () => void; onSharingChange?: () => void
}) {
  const [readers, setReaders] = useState<SessionReaderGrant[]>([])
  const [hours, setHours] = useState(24)
  const [sessions, setSessions] = useState<SharedSession[]>([])
  const [results, setResults] = useState<SessionReader[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [readersConfirmed, setReadersConfirmed] = useState(false)
  const hasActiveReaders = readers.some(reader => !reader.expiresAt || reader.expiresAt > Date.now())

  const reload = async () => {
    setLoading(true); setError(''); setReadersConfirmed(false); setCopied(false)
    try {
      if (sessionId) { setReaders(await listSessionReaders(sessionId)); setReadersConfirmed(true) }
      else setSessions(await listSharedSessions())
    } catch (e) { setError(e instanceof Error ? e.message : '读取失败，请重试') }
    finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [sessionId]) // 面板按对象挂载，不连接引擎。
  useEffect(() => {
    setResults([])
    if (!sessionId || query.trim().length < 2) { setSearching(false); return }
    const abort = new AbortController()
    setSearching(true)
    const timer = setTimeout(() => {
      void searchSessionRecipients(sessionId, query.trim(), abort.signal).then(found => { if (!abort.signal.aborted) setResults(found) })
        .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '搜索失败') })
        .finally(() => { if (!abort.signal.aborted) setSearching(false) })
    }, 300)
    return () => { clearTimeout(timer); abort.abort() }
  }, [query, sessionId])

  const change = async (reader: SessionReader, grant: boolean) => {
    if (!sessionId || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (grant) await grantSessionReader(sessionId, reader.id, hours)
      else await revokeSessionReader(sessionId, reader.id)
      setNotice(grant ? `已授权 ${reader.realName || reader.username} 继续会话` : '已撤回共享，接收者无法继续访问')
      await reload()
    } catch (e) {
      await reload()
      setError(`${e instanceof Error ? e.message : '保存结果未确认'}。请核对当前授权后再试。`)
    }
    finally { onSharingChange?.(); setBusy(false) }
  }

  return <Sheet open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <SheetContent side="bottom" className="mx-auto flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden p-5"
      onCloseAutoFocus={e => { if (returnFocus) { e.preventDefault(); returnFocus() } }}>
      <SheetTitle className="break-words">{sessionId ? `共享会话${sessionTitle ? ` · ${sessionTitle}` : ''}` : '共享给我'}</SheetTitle>
      <SheetDescription>{sessionId
        ? '选中的账号可继续此会话，发送消息、确认请求和中断任务，并查看会话历史。你可以随时撤回共享。'
        : '其他用户授权你查看的会话。需要使用被授权的账号登录。'}</SheetDescription>
      <div className="min-h-0 overflow-y-auto py-2">
        {error && <div role="alert" className="mb-3 text-sm text-destructive">{error} <Button variant="ghost" size="sm" onClick={() => void reload()}>重试</Button></div>}
        {notice && <p role="status" className="mb-3 text-sm">{notice}</p>}
        {busy && <p role="status" className="mb-3 text-sm">正在更新授权…</p>}
        {loading ? <p role="status" className="py-4 text-sm">正在读取…</p> : sessionId ? <>
          <label className="block text-sm" htmlFor="share-recipient">用户名或姓名</label>
          <input id="share-recipient" value={query} maxLength={80} placeholder="例如：严伟（至少两个字）"
            onChange={e => setQuery(e.target.value)} className="my-2 h-11 w-full rounded-md border bg-background px-3 text-sm" />
          <label htmlFor="share-duration" className="block text-sm">查看期限</label>
          <select id="share-duration" value={hours} disabled={busy} onChange={e => setHours(Number(e.target.value))}
            className="my-2 h-11 w-full rounded-md border bg-background px-3 text-sm">
            <option value={1}>1 小时</option>
            <option value={24}>24 小时</option>
            <option value={168}>7 天</option>
          </select>
          {searching && <p role="status" className="text-sm">正在搜索…</p>}
          {!searching && query.trim().length >= 2 && !results.length && <p className="text-sm text-muted-foreground">未找到可用账号，请核对用户名或姓名。</p>}
          <ul className="divide-y">{results.map(reader => <li key={reader.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
            <span className="min-w-0 break-words text-sm">{reader.realName || reader.username} <span className="text-muted-foreground">@{reader.username}</span></span>
            <Button size="sm" className="min-h-11 shrink-0" disabled={busy || readers.some(r => r.id === reader.id && r.collaborate && (!r.expiresAt || r.expiresAt > Date.now()))} onClick={() => void change(reader, true)}>授权继续会话</Button>
          </li>)}</ul>
          <h3 className="mb-1 mt-5 text-sm font-medium">已共享</h3>
          {!readersConfirmed ? <p className="py-2 text-sm text-muted-foreground">授权列表尚未确认，请先重试读取。</p>
            : !hasActiveReaders && <p className="py-2 text-sm text-muted-foreground">尚无有效共享授权。请先搜索接收账号，点击「授权继续会话」，确认账号出现在下方后再复制链接。</p>}
          <ul className="divide-y">{readers.map(reader => <li key={reader.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
            <span className="min-w-0 break-words text-sm">{reader.realName || reader.username} <span className="text-muted-foreground">@{reader.username}</span>
              <span className="block text-xs text-muted-foreground">{reader.collaborate ? '可继续会话' : '只读'} · {reader.expiresAt ? `到期 ${new Date(reader.expiresAt).toLocaleString()}` : '无期限'}</span>
            </span>
            <Button variant="ghost" size="sm" className="min-h-11 shrink-0" disabled={busy} onClick={() => void change(reader, false)}>撤回共享</Button>
          </li>)}</ul>
          <Button variant="outline" className="mt-4" disabled={busy || !readersConfirmed || !hasActiveReaders} onClick={() => {
            if (!readers.some(reader => !reader.expiresAt || reader.expiresAt > Date.now())) {
              setError('共享授权已到期，请重新授权后再复制链接'); setCopied(false); return
            }
            void Promise.resolve().then(() => navigator.clipboard.writeText(new URL(sharedSessionPath(sessionId), location.origin).href))
              .then(() => setCopied(true)).catch(() => setError('复制失败，请稍后重试'))
          }}>{copied ? '链接已复制，仅已授权账号可访问' : '复制共享链接'}</Button>
          <p className="mt-2 text-xs text-muted-foreground">复制链接不会授权；接收者须使用「已共享」列表中的账号登录。撤销不能收回对方已读或已复制的文字。</p>
        </> : <ul className="divide-y">
          {!sessions.length && <li className="py-4 text-sm text-muted-foreground">暂无共享给你的会话。</li>}
          {sessions.map(session => <li key={session.id}><Link to={session.collaborate ? collaborationPath(session.id) : sharedSessionPath(session.id)} onClick={onClose}
            className="block min-h-12 py-3 text-sm hover:underline">{session.title || '未命名会话'}<span className="ml-2 text-muted-foreground">{session.collaborate ? '可继续会话' : '只读'} · {session.engine}</span></Link></li>)}
        </ul>}
      </div>
    </SheetContent>
  </Sheet>
}
