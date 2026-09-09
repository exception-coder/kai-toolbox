import type { CollaborationContext } from '../contracts'
import { useId, useRef, useState } from 'react'
import { ArrowUp, Paperclip, Square, X } from 'lucide-react'
import { Button, Input, Textarea } from '../ui'
import type { useForgeRelay } from '../application/useForgeRelay'
import { requirementKinds, requirementPrompt, type RequirementKind } from '../model/requirementDraft'

export function ForgeRelayComposer({ relay, disabled, context }: { context: CollaborationContext; relay: ReturnType<typeof useForgeRelay>; disabled: boolean }) {
  const messageId = useId()
  const attachmentId = useId()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<RequirementKind>('需求')
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)
  async function send(organize = false) {
    if (disabled || (!organize && !text.trim())) return
    const content = organize ? '请根据本次已澄清的对话整理需求稿，缺少的信息列入待确认项。' : text.trim()
    const success = await relay.run(async active => {
      const attachments = []
      for (const file of files) attachments.push(await active.upload(file))
      await active.send({ text: requirementPrompt(kind, content, context), attachments: attachments.length ? attachments : undefined })
    })
    if (success) { if (!organize) setText(''); setFiles([]); setNotice('已发送，等待助手回复。') }
  }
  return <form className="shrink-0 space-y-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5" onSubmit={e => { e.preventDefault(); void send() }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="需求类型" className="flex gap-1">{requirementKinds.map(item =>
        <Button type="button" size="sm" key={item} variant={kind === item ? 'secondary' : 'ghost'} aria-pressed={kind === item} onClick={() => setKind(item)}>{item}</Button>)}</div>
      <Button type="button" size="sm" variant="ghost" disabled={disabled || !relay.view.messages.length || Boolean(files.length)} onClick={() => void send(true)}>整理需求稿</Button>
    </div>
    <label className="sr-only" htmlFor={messageId}>业务需求</label>
    <Textarea id={messageId} value={text} onChange={e => { setText(e.target.value); setNotice('') }} rows={3}
      className="max-h-40 resize-y" placeholder={kind === 'BUG' ? '在哪个页面、做了什么操作？实际结果与预期有什么不同？' : '你在什么场景下，希望完成什么？可以附上截图。'}
      onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
    {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((file, i) => <span key={`${file.name}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs"><span className="truncate">{file.name}</span><Button type="button" size="sm" variant="ghost" aria-label={`移除 ${file.name}`} disabled={relay.busy} onClick={() => setFiles(previous => previous.filter((_, index) => index !== i))}><X className="size-3" /></Button></span>)}</div>}
    <Input ref={input} id={attachmentId} aria-label="附件（可选）" type="file" multiple className="hidden" disabled={disabled}
      onChange={e => { const next = Array.from(e.target.files ?? []); if (next.some(f => f.size > 10 * 1024 * 1024) || next.length + files.length > 5) { setNotice('最多添加 5 个附件，每个不超过 10 MB。'); return } setFiles(previous => [...previous, ...next]); e.target.value = '' }} />
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => input.current?.click()}><Paperclip className="size-4" />附件</Button><span className="hidden text-xs text-[var(--color-muted)] sm:inline">Ctrl / ⌘ + Enter 发送</span></div>
      <div className="flex gap-2"><Button type="button" variant="ghost" size="sm" aria-label="停止本轮" disabled={disabled} onClick={() => void relay.run(active => active.interrupt())}><Square className="size-4" /></Button><Button type="submit" disabled={disabled || !text.trim()}><ArrowUp className="size-4" />发送需求</Button></div></div>
    {notice && <p role="status" className="text-xs text-[var(--color-secondary)]">{notice}</p>}
  </form>
}
