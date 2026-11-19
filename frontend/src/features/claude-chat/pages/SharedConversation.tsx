import { useEffect, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MessageList } from '../components/MessageList'
import { PermissionDialog } from '../components/PermissionDialog'
import { QuestionDialog } from '../components/QuestionDialog'
import { useComposerFileUpload } from '../hooks/useComposerFileUpload'
import { useDraftAttachments, useDraftAttachmentUploads } from '../lib/attachmentDraftPref'
import { useDraft } from '../lib/draftPref'
import { useWorkbenchPageTheme, useWorkbenchTheme } from '../lib/workbenchTheme'
import { useChatRuntime } from '../runtime/ChatRuntimeContext'
import { getSharedSession } from '../sessionSharingApi'
import '../styles/workbench-theme.css'
import '../styles/mobile-workspace.css'

export function SharedConversation({ sessionId }: { sessionId: string }) {
  const { activate, chat } = useChatRuntime()
  useWorkbenchPageTheme(useWorkbenchTheme())
  useEffect(() => { activate() }, [activate])
  const { data: session } = useQuery({
    queryKey: ['claude-chat-collaboration', sessionId],
    queryFn: () => getSharedSession(sessionId),
    retry: false,
  })
  const current = chat?.sessionId === sessionId ? chat : null
  const ready = current?.state === 'ready' && !current.reviewOnly
  const [draft, setDraft] = useDraft(sessionId)
  const [attachments, setAttachments] = useDraftAttachments(sessionId)
  const [uploading] = useDraftAttachmentUploads(sessionId)
  const { uploadFiles, error } = useComposerFileUpload({ sessionId, disabled: !ready, limit: 10 })
  const pending = current?.pending

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!current || !ready || uploading || (!draft.trim() && !attachments.length)) return
    const files = attachments.map(({ name, path, mime, previewUrl }) => ({ name, path, mime, url: previewUrl }))
    if (current.running || pending) current.enqueue(draft, files)
    else current.send(draft, files)
    setDraft('')
    setAttachments([])
  }

  return <section className="cc-mobile-coding-workspace mx-auto flex h-full min-h-0 max-w-4xl flex-col bg-background">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">共享会话</p>
        <h1 className="truncate font-medium">{session?.title || '会话对话'}</h1>
      </div>
      <Button asChild variant="ghost" className="min-h-11 shrink-0"><Link to="/">退出共享会话</Link></Button>
    </header>
    {current ? <MessageList sessionKey={sessionId} items={current.items} running={current.running}
      engineLabel={session?.engine ?? undefined} connState={current.state} copyOnly mobileWorkspace showExecutionDetails={false}
      onLoadEarlier={() => void current.loadHistory(false)} onLoadLatest={() => current.loadHistory(true)}
      loadingEarlier={current.historyLoading} exhausted={current.historyExhausted} loadEarlierError={current.historyError} />
      : <p role="status" className="flex-1 p-4 text-sm text-muted-foreground">正在连接共享会话…</p>}
    {chat?.errorMessage && <p role="alert" className="px-4 py-2 text-sm text-destructive">{chat.errorMessage}</p>}
    <form onSubmit={submit} className="shrink-0 border-t p-3 pb-[max(20px,env(safe-area-inset-bottom))]">
      {current?.queued.length ? <p role="status" className="mb-2 text-xs text-muted-foreground">
        待发送 {current.queued.length} 条{current.queuePausedReason ? ` · ${current.queuePausedReason}` : ''}
      </p> : null}
      {attachments.map(file => <Button key={file.id} type="button" variant="ghost" size="sm"
        aria-label={`移除附件 ${file.name}`} onClick={() => setAttachments(files => files.filter(item => item.id !== file.id))}>{file.name} ×</Button>)}
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      <textarea aria-label="消息输入" value={draft} onChange={event => setDraft(event.target.value)}
        onPaste={event => { if (ready && event.clipboardData.files.length) { event.preventDefault(); void uploadFiles(event.clipboardData.files) } }}
        rows={2} className="block w-full resize-none rounded-md border bg-background p-2 text-base" placeholder="输入消息…" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 text-sm focus-within:ring-2">
          {uploading ? '正在上传…' : '添加附件'}
          <input type="file" multiple aria-label="添加附件" disabled={!ready} className="sr-only" onChange={event => {
            void uploadFiles(event.target.files)
            event.target.value = ''
          }} />
        </label>
        {current?.running && <Button type="button" variant="ghost" className="min-h-11" disabled={current.interrupting}
          onClick={current.interrupt}>停止</Button>}
        <Button className="ml-auto min-h-11" disabled={!ready || !!uploading || (!draft.trim() && !attachments.length)}>
          {current?.running || pending ? '加入待发送' : '发送'}
        </Button>
      </div>
    </form>
    {pending?.kind === 'permission' && <PermissionDialog toolName={pending.toolName} input={pending.input}
      onAllow={() => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })}
      onDeny={() => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })} />}
    {pending?.kind === 'question' && <QuestionDialog questions={pending.questions}
      onCancel={() => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
      onSubmit={answers => current?.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow', answers })} />}
  </section>
}
