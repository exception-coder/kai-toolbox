import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { communicationError, getCommunication } from '../../api/communicationJournal'
import { editJournalDraft, type JournalDraft } from './journalDraft'
import { CommunicationFields, journalInputClass as inputClass } from './CommunicationFields'
import { JOURNAL_IMAGE_TYPES, useJournalImages } from './useJournalImages'
export { journalFileIssue } from './useJournalImages'


interface Props {
  sessionId: string; sessionTitle: string; userScope: string | number; draft: JournalDraft; open: boolean; saving: boolean; error: string
  onChange: (draft: JournalDraft) => void; onOpenChange: (open: boolean) => void
  onSave: () => void; onDiscard: () => void; storageAvailable: boolean; readOnly: boolean
}

export function CommunicationEditor(props: Props) {
  const { sessionId, sessionTitle, userScope, draft, open, saving, error, onChange, onOpenChange, onSave, onDiscard, storageAvailable, readOnly } = props
  const portal = useFullscreenPortalContainer()
  const fileInput = useRef<HTMLInputElement>(null), alive = useRef(true)
  const [savedVersion, setSavedVersion] = useState<JournalDraft | null>(null), [checking, setChecking] = useState(false)
  const { uploading, error: uploadError, upload, setError: setUploadError, previews } = useJournalImages(sessionId, userScope, { draft, disabled: saving || checking || readOnly, onChange })
  const busy = saving || uploading || checking, locked = busy || readOnly
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const setField = <K extends keyof JournalDraft['input']>(key: K, value: JournalDraft['input'][K]) =>
    onChange({ ...draft, input: { ...draft.input, [key]: value } })

  const checkSaved = async () => {
    setChecking(true); setUploadError('')
    try {
      const result = await getCommunication(sessionId, draft.id)
      if (alive.current) setSavedVersion(editJournalDraft(result))
    } catch (reason) { if (alive.current) setUploadError(communicationError(reason)) }
    finally { if (alive.current) setChecking(false) }
  }

  return <Dialog.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
    <Dialog.Portal container={portal}><Dialog.Overlay className="fixed inset-0 z-[80] bg-black/35" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex max-h-[92dvh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-[var(--color-background)]"
        onCloseAutoFocus={event => { event.preventDefault(); document.getElementById(`communication-new-${sessionId}`)?.focus() }}>
        <header className="flex items-start gap-4 border-b p-4 sm:px-6">
          <div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold">{draft.input.expectedVersion ? '编辑待办' : '新增待办'}</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">{sessionTitle} · 时间自动记录</Dialog.Description></div>
          <Dialog.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" disabled={busy} aria-label="关闭待办编辑"><X /></Button></Dialog.Close>
        </header>
        <form id={`journal-form-${draft.id}`} onSubmit={event => { event.preventDefault(); if (!locked) onSave() }} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-6"
          onPaste={event => { const files = Array.from(event.clipboardData.files).filter(file => JOURNAL_IMAGE_TYPES.has(file.type)); if (files.length) { event.preventDefault(); void upload(files) } }}>
          <CommunicationFields input={draft.input} disabled={locked} onChange={patch => onChange({ ...draft, input: { ...draft.input, ...patch } })} />
          <section aria-label="待办图片" className="rounded-md border border-dashed p-3" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={event => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)) }}>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[var(--color-muted-foreground)]">粘贴或拖入图片{draft.images.length ? ` · ${draft.images.length} / 10` : ''}</span>
              <Button type="button" variant="ghost" className="min-h-11" disabled={locked} onClick={() => fileInput.current?.click()}><ImagePlus />添加图片</Button></div>
            <input ref={fileInput} aria-label="选择待办图片" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" disabled={locked}
              onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
            {draft.images.length > 0 && <ul className="mt-2 divide-y">{draft.images.map(image => <li key={image.id} className="flex items-center gap-2 py-1 text-xs">
              {previews[image.id] && <img src={previews[image.id]} alt={image.name} className="size-14 rounded-md object-contain" />}
              <span className="min-w-0 flex-1 break-all">{image.name} · {(image.size / 1024).toFixed(0)} KB</span>
              <Button type="button" variant="ghost" className="min-h-11" disabled={locked} aria-label={`移除截图 ${image.name}`} onClick={() => onChange({ ...draft,
                images: draft.images.filter(value => value.id !== image.id), input: { ...draft.input, attachmentIds: draft.input.attachmentIds.filter(id => id !== image.id) } })}><X /></Button>
            </li>)}</ul>}
            {uploading && <p role="status" className="mt-2 text-xs">正在上传截图，请等待后再保存…</p>}
          </section>
          {draft.input.notes && <details className="text-xs"><summary className="min-h-11 cursor-pointer py-3">旧记录备注</summary><label className="block space-y-1">备注<textarea rows={3} maxLength={20000} className={inputClass + ' resize-y leading-relaxed'} value={draft.input.notes} onChange={event => setField('notes', event.target.value)} disabled={locked} /></label></details>}
          {(error || uploadError) && <div role="alert" className="border-l-2 border-amber-500 pl-3 text-sm"><p>{error || uploadError}</p>
            {error && <Button type="button" variant="ghost" disabled={locked} className="mt-1 min-h-11" onClick={() => void checkSaved()}>核对已保存内容</Button>}</div>}
          {savedVersion && <section className="border-t pt-3 text-xs"><h3 className="font-medium">服务器已保存版本 · {savedVersion.input.expectedVersion}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words">{savedVersion.input.title}{'\n'}原文：{savedVersion.input.originalText}{'\n'}备注：{savedVersion.input.notes}</p>
            <Button type="button" variant="outline" className="mt-2 min-h-11" disabled={locked} onClick={() => { onChange(savedVersion); setSavedVersion(null) }}>采用已保存内容，替换本页草稿</Button></section>}
          {!storageAvailable && <p role="status" className="text-xs">浏览器无法保留刷新后的草稿；当前页面仍可编辑，请保存后再刷新。</p>}
          {readOnly && <p role="status" className="text-xs">会话已锁定，草稿保留；解锁后可继续编辑和保存。</p>}
        </form>
        <footer className="flex items-center justify-between gap-3 border-t p-3 sm:px-6">
          <Button variant="ghost" className="min-h-11 text-xs" disabled={busy} onClick={onDiscard}>放弃草稿</Button>
          <div className="flex gap-2"><Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
            <Button form={`journal-form-${draft.id}`} type="submit" className="min-h-11" disabled={locked}>{saving && <Loader2 className="animate-spin" />} {saving ? '保存中…' : '保存'}</Button></div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
