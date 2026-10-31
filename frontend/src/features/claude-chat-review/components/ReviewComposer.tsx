import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Loader2, Paperclip, RefreshCw, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AttachmentChips, QueuedList, uploadReviewAttachment, type UploadedAttachment, type UseClaudeChatSocket } from '@/features/claude-chat/public-api'

type Attachment = UploadedAttachment & { url?: string }
type FailedUpload = { id: string; file: File; url?: string; message: string }
export function ReviewComposer({ token, chat }: { token: string; chat: UseClaudeChatSocket }) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [failed, setFailed] = useState<FailedUpload[]>([])
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const urls = useRef(new Set<string>())
  const reserved = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false; urls.current.forEach(url => URL.revokeObjectURL(url)) } }, [])
  useLayoutEffect(() => {
    if (!textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.min(144, Math.max(44, textarea.current.scrollHeight))}px`
  }, [text])
  const revoke = (url?: string) => { if (url) { URL.revokeObjectURL(url); urls.current.delete(url) } }
  const upload = async (files: File[], reclaimedSlots = 0) => {
    const available = Math.max(0, 10 - attachments.length - failed.length - reserved.current + reclaimedSlots)
    const selected = files.slice(0, available)
    if (files.length > available) setError('每条消息最多添加 10 个附件。')
    reserved.current += selected.length; setUploading(value => value + selected.length)
    for (const file of selected) {
      const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      if (url) urls.current.add(url)
      try {
        const result = await uploadReviewAttachment(token, file)
        if (alive.current) setAttachments(previous => [...previous, { ...result, url }])
        else revoke(url)
      } catch (cause) {
        if (alive.current) setFailed(previous => [...previous, { id: crypto.randomUUID(), file, url, message: cause instanceof Error ? cause.message : '上传失败' }])
        else revoke(url)
      } finally { reserved.current--; if (alive.current) setUploading(value => Math.max(0, value - 1)) }
    }
  }
  const send = () => {
    if (uploading || (!text.trim() && !attachments.length) || chat.state !== 'ready') return
    if (chat.running || chat.queued.length) chat.enqueue(text, attachments)
    else chat.send(text, attachments)
    setText(''); setAttachments([]); setError(null)
    attachments.forEach(item => revoke(item.url))
  }
  return <div className="review-composer">
    <div className="flex min-h-7 items-center gap-2 text-xs text-[var(--color-muted-foreground)]" aria-live="polite">
      {chat.state !== 'ready' ? <><Loader2 className="size-3.5 animate-spin" />正在连接评审会话</> : chat.running ? <><Loader2 className="size-3.5 animate-spin" />AI 正在回复，可继续补充问题</> : <span>讨论问题，再确认需求</span>}
      {chat.queued.length > 0 && <details className="ml-auto"><summary className="cursor-pointer">待发送 {chat.queued.length}</summary><div className="max-h-36 overflow-y-auto"><QueuedList items={chat.queued} pausedReason={chat.queuePausedReason} canSendNow={!chat.running && !chat.pending && chat.backgroundTasks.length === 0} onSendNow={chat.sendQueuedNow} onRemove={chat.removeQueued} onClear={chat.clearQueued} /></div></details>}
    </div>
    <AttachmentChips items={attachments} uploading={uploading} onRemove={id => setAttachments(previous => { revoke(previous.find(item => item.id === id)?.url); return previous.filter(item => item.id !== id) })} />
    {error && <p role="alert" className="py-1 text-xs text-[var(--color-destructive)]">{error}</p>}
    {failed.length > 0 && <ul className="flex max-h-24 flex-wrap gap-2 overflow-y-auto py-1">{failed.map(item => <li key={item.id} className="flex items-center gap-2 text-xs"><span className="max-w-44 truncate" title={item.message}>{item.file.name} 上传失败</span><button className="min-h-11 underline" onClick={() => { setFailed(previous => previous.filter(value => value.id !== item.id)); revoke(item.url); void upload([item.file], 1) }}><RefreshCw className="mr-1 inline size-3" />重试</button><button className="min-h-11 underline" onClick={() => { setFailed(previous => previous.filter(value => value.id !== item.id)); revoke(item.url) }}>移除</button></li>)}</ul>}
    <div className="flex items-end gap-1 rounded-xl border bg-[var(--color-background)] p-1">
      <label className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md focus-within:ring-2" title="添加截图或附件"><input aria-label="添加截图或附件" className="sr-only" type="file" multiple disabled={uploading > 0} onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />{uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-5" />}</label>
      <textarea ref={textarea} aria-label="评审消息" value={text} rows={1} placeholder="描述问题，或粘贴截图…" className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-3 text-sm leading-5 outline-none"
        onChange={event => setText(event.target.value)} onPaste={event => { const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file); if (files.length) { event.preventDefault(); void upload(files) } }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia?.('(pointer: coarse)').matches) { event.preventDefault(); send() } }} />
      {chat.running && <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label="停止当前回复" onClick={chat.interrupt}><Square className="size-4" /></Button>}
      <Button size="icon" className="size-11 shrink-0" aria-label={chat.running || chat.queued.length ? '加入待发送队列' : '发送评审消息'} disabled={uploading > 0 || chat.state !== 'ready' || (!text.trim() && !attachments.length)} onClick={send}><Send className="size-4" /></Button>
    </div>
  </div>
}
