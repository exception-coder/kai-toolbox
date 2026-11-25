import { useEffect, useLayoutEffect, useMemo, useRef, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Send, Square } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { MessageList } from '../components/MessageList'
import { PermissionDialog } from '../components/PermissionDialog'
import { QuestionDialog } from '../components/QuestionDialog'
import { ReceivedShareNavigation } from '../components/ReceivedShareNavigation'
import { SharedConversationHeader } from '../components/SharedConversationHeader'
import { useComposerFileUpload } from '../hooks/useComposerFileUpload'
import { useDraftAttachments, useDraftAttachmentUploads } from '../lib/attachmentDraftPref'
import { useDraft } from '../lib/draftPref'
import { useWorkbenchPageTheme, useWorkbenchTheme } from '../lib/workbenchTheme'
import { useChatRuntime } from '../runtime/ChatRuntimeContext'
import { getSharedSession, sharedSessionPath } from '../sessionSharingApi'
import '../styles/workbench-theme.css'
import '../styles/mobile-workspace.css'
import '../styles/mobile-composer.css'

export function SharedConversation({ sessionId }: { sessionId: string }) {
  const { activate, chat } = useChatRuntime()
  const { user } = useAuth()
  useWorkbenchPageTheme(useWorkbenchTheme())
  const textarea = useRef<HTMLTextAreaElement>(null)
  const { data: session, error: accessError, refetch } = useQuery({
    queryKey: ['claude-chat-collaboration', user?.userId, sessionId],
    queryFn: () => getSharedSession(sessionId),
    retry: false,
  })
  const current = chat?.sessionId === sessionId ? chat : null
  const canReply = session?.id === sessionId && session.collaborate === true && !accessError
  useEffect(() => { if (canReply) activate() }, [activate, canReply])
  const denied = current?.collaborationAccessLost || (session && session.id !== sessionId)
    || (accessError instanceof ApiError && [401, 403, 404].includes(accessError.status))
  const ready = canReply && !denied && current?.state === 'ready' && !current.reviewOnly
  const [draft, setDraft] = useDraft(sessionId)
  const [attachments, setAttachments] = useDraftAttachments(sessionId)
  const [uploading] = useDraftAttachmentUploads(sessionId)
  const { uploadFiles, error } = useComposerFileUpload({ sessionId, disabled: !ready, limit: 10 })
  const pending = current?.pending
  const items = useMemo(() => current?.items.filter(item => item.kind !== 'error' && item.kind !== 'warning') ?? [], [current?.items])
  useLayoutEffect(() => {
    const input = textarea.current
    if (!input) return
    input.style.height = 'auto'
    if (draft) input.style.height = `${input.scrollHeight}px`
  }, [draft, ready])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!current || !ready || uploading || (!draft.trim() && !attachments.length)) return
    const files = attachments.map(({ name, path, mime, previewUrl }) => ({ name, path, mime, url: previewUrl }))
    if (current.running || current.backgroundTasks.length > 0 || pending) {
      if (current.enqueue(draft, files) === false) return
    } else if (current.send(draft, files) === false) return
    setDraft('')
    setAttachments([])
  }

  if (!denied && !accessError && session?.id === sessionId && !session.collaborate) {
    return <Navigate replace to={sharedSessionPath(sessionId)} />
  }
  if (denied || accessError) return <section className="flex h-full min-h-0 flex-col bg-background">
    <SharedConversationHeader title={null} mode={denied ? '无访问权限' : '正在核验'} />
    <div className="mx-auto w-full max-w-xl space-y-3 p-5 text-sm">
      <p role="alert">{denied ? '无法继续访问。请确认登录账号，或联系分享人核对授权。' : '暂时无法核验权限，请检查网络后重试。'}</p>
      {denied ? <Button asChild variant="outline" className="min-h-11"><Link to={sharedSessionPath(sessionId)} replace>重新检查共享权限</Link></Button>
        : <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>重试</Button>}
    </div>
  </section>

  return <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-background">
    {canReply && <ReceivedShareNavigation session={session} />}
    <section className="cc-mobile-coding-workspace cc-shared-conversation flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
    <SharedConversationHeader title={canReply ? session.title : null} mode={canReply ? '可回复' : '正在核验'} session={canReply ? session : null} />
    {canReply && current ? <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col"><MessageList sessionKey={sessionId} items={items} running={current.running}
      engineLabel={session?.engine ?? undefined} connState={current.state} copyOnly mobileWorkspace showExecutionDetails={false}
      onLoadEarlier={() => void current.loadHistory(false)} onLoadLatest={() => current.loadHistory(true)}
      loadingEarlier={current.historyLoading} exhausted={current.historyExhausted}
      loadEarlierError={current.historyError ? '历史读取失败，点此重试' : null} /></div>
      : <p role="status" className="flex-1 p-4 text-sm text-muted-foreground">正在连接共享会话…</p>}
    {canReply && current?.errorMessage && <p role="alert" className="shrink-0 border-t px-4 py-2 text-sm text-muted-foreground">{current.errorMessage}</p>}
    {canReply && !ready && <p role="status" className="shrink-0 border-t px-4 py-2 text-sm text-muted-foreground">连接就绪后可以回复。</p>}
    {ready && <form onSubmit={submit} className="cc-focus-composer mx-auto w-full max-w-5xl shrink-0 border-t bg-background px-3 py-2 pb-[max(20px,env(safe-area-inset-bottom))]">
      {current?.queued.length ? <p role="status" className="mb-2 text-xs text-muted-foreground">
        待发送 {current.queued.length} 条{current.queuePausedReason ? ' · 排队已暂停，请联系分享人确认后继续' : ''}
      </p> : null}
      {attachments.length > 0 && <div className="flex min-w-0 flex-wrap gap-1">
        {attachments.map(file => <Button key={file.id} type="button" variant="ghost" size="sm" className="min-w-0 max-w-full"
          aria-label={`移除附件 ${file.name}`} onClick={() => setAttachments(files => files.filter(item => item.id !== file.id))}>
          <span className="truncate">{file.name}</span><span aria-hidden="true">×</span>
        </Button>)}
      </div>}
      {error && <p role="alert" className="mb-2 text-sm text-destructive">附件未能添加。请检查文件或网络后重试。</p>}
      <div className="mobile-composer-card cc-inline-composer flex min-w-0 items-end gap-1 rounded-xl border bg-background p-1 focus-within:ring-1 focus-within:ring-ring">
        <label className="cc-composer-more relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md focus-within:ring-2">
          <Plus aria-hidden="true" className="size-5" />
          <input type="file" multiple aria-label="添加附件" disabled={!!uploading} className="sr-only" onChange={event => {
            void uploadFiles(event.target.files)
            event.target.value = ''
          }} />
        </label>
        <div className="cc-composer-text min-w-0 flex-1 self-center">
          <textarea ref={textarea} aria-label="消息输入" value={draft} onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
              if (window.matchMedia?.('(pointer: coarse)').matches) return
              event.preventDefault()
              if (!event.repeat) event.currentTarget.form?.requestSubmit()
            }}
            onPaste={event => { if (event.clipboardData.files.length) { event.preventDefault(); void uploadFiles(event.clipboardData.files) } }}
            rows={1} className="block max-h-32 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-base leading-6 outline-none" placeholder="输入消息…" />
        </div>
        {current?.running && <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" disabled={current.interrupting}
          aria-label="停止当前回复" onClick={current.interrupt}><Square /></Button>}
        <Button type="submit" size="icon" className="cc-composer-send size-11 shrink-0" disabled={!!uploading || (!draft.trim() && !attachments.length)}
            aria-label={current?.running || (current?.backgroundTasks.length ?? 0) > 0 || pending ? '加入待发送' : '发送'}>
          <Send />
        </Button>
      </div>
      {!!uploading && <p role="status" className="px-3 text-xs text-muted-foreground">正在上传附件…</p>}
    </form>}
    {ready && pending?.kind === 'permission' && <PermissionDialog toolName={pending.toolName} input={pending.input}
      onAllow={() => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })}
      onDeny={() => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })} />}
    {ready && pending?.kind === 'question' && <QuestionDialog questions={pending.questions}
      onCancel={() => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
      onSubmit={answers => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow', answers })} />}
    </section>
  </div>
}
