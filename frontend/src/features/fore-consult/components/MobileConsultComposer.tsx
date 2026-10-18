import { useEffect, useRef, useState, type ClipboardEventHandler, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUp, FileText, Paperclip, Plus, X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import type { ConsultDraftAttachment } from '../consultAttachmentDispatch'
import './mobile-consult.css'

interface Props {
  value: string
  onChange: (value: string) => void
  title?: string
  onTitleChange?: (value: string) => void
  attachments: ConsultDraftAttachment[]
  onFiles: (files: FileList | null) => void | Promise<void>
  onRemove: (path: string) => void
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  onSend: () => void
  canSend: boolean
  disabled?: boolean
  attachmentsDisabled?: boolean
  busy?: boolean
  notice?: string | null
  options?: ReactNode
  voice?: ReactNode
  modelLabel?: string
  interrupt?: ReactNode
}

function syncEditorViewport(element: HTMLDivElement | null) {
  if (!element) return
  const viewport = window.visualViewport
  element.style.height = `${viewport?.height ?? window.innerHeight}px`
  element.style.top = `${viewport?.offsetTop ?? 0}px`
}

/** 只管理展示和编辑层；草稿、附件、校验及发送由原咨询控制器持有。 */
export function MobileConsultComposer(props: Props) {
  const [editing, setEditing] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const text = useRef<HTMLTextAreaElement>(null)
  const editor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const portal = useFullscreenPortalContainer()
  useEffect(() => {
    if (!editing) return
    const viewport = window.visualViewport
    const sync = () => syncEditorViewport(editor.current)
    sync()
    viewport?.addEventListener('resize', sync); viewport?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => { viewport?.removeEventListener('resize', sync); viewport?.removeEventListener('scroll', sync); window.removeEventListener('resize', sync) }
  }, [editing])
  const send = () => { if (!props.canSend) return; props.onSend(); setEditing(false) }
  const files = <input ref={file} type="file" multiple hidden disabled={props.attachmentsDisabled} onChange={event => { void props.onFiles(event.target.files); event.target.value = '' }} />
  const sendButton = <button type="button" className="fc-mobile-send" aria-label="发送咨询" disabled={!props.canSend} onClick={send}><ArrowUp className="size-4" /></button>
  return <>
    <div className="fc-mobile-composer" aria-label="咨询输入区">
      {props.notice && <p role="status" className="fc-mobile-notice">{props.notice}</p>}
      <button ref={trigger} type="button" className="fc-mobile-draft" disabled={props.disabled} onClick={() => setEditing(true)} aria-label="编辑咨询">
        <span className="line-clamp-1">{props.value || '输入问题或粘贴截图…'}</span>
        {props.attachments.length > 0 && <span className="fc-mobile-attachment-count"><Paperclip className="size-3" />附件 {props.attachments.length} · 查看</span>}
      </button>
      <div className="fc-mobile-actions">
        <button type="button" aria-label="添加咨询附件" disabled={props.attachmentsDisabled} onClick={() => { setEditing(true); file.current?.click() }}><Plus className="size-5" /></button>
        {props.voice}
        <button type="button" className="fc-mobile-model" onClick={() => { setShowOptions(true); setEditing(true) }} aria-label="查看咨询模型设置">{props.modelLabel || '当前模型'}</button>
        {props.interrupt}{sendButton}
      </div>
    </div>
    {files}
    <Dialog.Root open={editing} onOpenChange={setEditing}>
      <Dialog.Portal container={portal}>
        <Dialog.Content ref={editor} className="fc-mobile-editor" aria-describedby={undefined}
          onOpenAutoFocus={event => { event.preventDefault(); syncEditorViewport(editor.current); text.current?.focus({ preventScroll: true }) }}
          onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }) }}>
          <header className="fc-mobile-editor-header"><Dialog.Title>编辑咨询</Dialog.Title><Dialog.Close>完成</Dialog.Close></header>
          <div className="fc-mobile-editor-meta">
            {props.onTitleChange && <details><summary>问题标题（可选）</summary><input name="consult-mobile-question-subject" autoComplete="off" aria-label="问题标题" value={props.title ?? ''} maxLength={33} onChange={event => props.onTitleChange?.(event.target.value)} placeholder="默认从问题生成" /></details>}
            {props.attachments.length > 0 && <details><summary>附件 · {props.attachments.length}</summary><ul className="fc-mobile-attachments">
              {props.attachments.map(att => <li key={att.path}>{att.url ? <img src={att.url} alt="" /> : <FileText className="size-5" />}<span>{att.name}</span><button type="button" onClick={() => props.onRemove(att.path)} aria-label={`移除附件 ${att.name}`}><X className="size-4" /></button></li>)}
            </ul></details>}
            {props.notice && <p role="status" className="fc-mobile-notice">{props.notice}</p>}
          </div>
          <textarea ref={text} aria-label="咨询问题描述" value={props.value} disabled={props.disabled} onChange={event => props.onChange(event.target.value)} onPaste={props.onPaste} placeholder="描述问题或粘贴截图…" />
          {showOptions && <div className="fc-mobile-options">{props.options ?? <p>沿用当前咨询模型</p>}</div>}
          <footer className="fc-mobile-actions"><button type="button" aria-label="添加咨询附件" disabled={props.attachmentsDisabled} onClick={() => file.current?.click()}><Plus className="size-5" /></button><button type="button" className="fc-mobile-model" onClick={() => setShowOptions(value => !value)}>{props.modelLabel || '当前模型'}</button>{props.interrupt}{sendButton}</footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}
