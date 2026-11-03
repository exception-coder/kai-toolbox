import { forwardRef, useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import { FileText, X } from 'lucide-react'
import { changedRange, editVisibleDraft, shouldFoldPaste, visibleDraft, type FoldedPaste } from '../lib/foldedPaste'

interface Props extends ComponentPropsWithoutRef<'textarea'> {
  compact?: boolean
  suggestion?: string | null
  onAcceptSuggestion: (text: string) => void
  onDismissSuggestion: () => void
  draftScope?: string
  onValueChange?: (value: string, caret: number) => void
}

/** Native suggestions are preview text, never the textarea's value or a send action. */
export const ComposerTextarea = forwardRef<HTMLTextAreaElement, Props>(function ComposerTextarea({
  compact = false, suggestion, onAcceptSuggestion, onDismissSuggestion, onKeyDown, onChange,
  onCompositionStart, onCompositionEnd, onPaste, onValueChange, draftScope, rows, ...props
}, ref) {
  const hintId = useId()
  const [composing, setComposing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [storedFold, setFold] = useState<(FoldedPaste & { scope?: string }) | null>(null)
  const raw = typeof props.value === 'string' ? props.value : ''
  const fold = storedFold?.raw === raw && storedFold.scope === draftScope ? storedFold : null
  const displayed = visibleDraft(raw, fold)
  const hidden = fold ? raw.slice(fold.start, fold.end) : ''
  const title = hidden.split('\n').find(line => line.trim())?.replace(/^\s{0,3}#{1,6}\s+/, '').trim() || '粘贴的文本'
  useLayoutEffect(() => {
    if (storedFold && !fold) setFold(null)
  }, [storedFold, fold])
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    if (displayed) input.style.height = `${input.scrollHeight}px`
  }, [displayed, Boolean(fold)])
  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus())
  const visible = Boolean(suggestion && props.value === '' && !props.disabled && !composing)
  return (
    <div data-folded={Boolean(fold)} className="cc-composer-text col-span-3 row-start-1 min-w-0">
      {fold && <div className="cc-pasted-text mb-1 flex min-w-0 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40">
        <button type="button" disabled={props.disabled} aria-label="在文本框中显示粘贴的长文本"
          onClick={() => { setFold(null); focusInput() }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <span className="min-w-0"><span className="block truncate text-sm" title={title}>{title}</span>
            <span className="block text-xs text-[var(--color-muted-foreground)]">{hidden.length.toLocaleString()} 字符 · 展开编辑</span></span>
        </button>
        <button type="button" disabled={props.disabled} aria-label="删除粘贴的长文本" className="flex min-h-11 w-11 shrink-0 items-center justify-center"
          onClick={() => { onValueChange?.(displayed, fold.start); setFold(null); focusInput() }}>
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>}
      <textarea
        {...props}
        value={onValueChange ? displayed : props.value}
        data-fold-start={fold?.start}
        data-fold-end={fold?.end}
        ref={node => { inputRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node }}
        placeholder={visible ? suggestion! : props.placeholder}
        aria-describedby={visible ? hintId : props['aria-describedby']}
        rows={visible && !compact ? 2 : rows}
        onChange={event => {
          if (onValueChange) {
            const change = changedRange(displayed, event.target.value)
            const next = editVisibleDraft(raw, fold, change.start, change.end, change.text)
            setFold(next.fold ? { ...next.fold, scope: draftScope } : null)
            const caret = event.target.selectionStart
            onValueChange(next.raw, next.fold && caret >= next.fold.start ? caret + next.fold.end - next.fold.start : caret)
          } else onChange?.(event)
          if (event.target.value && suggestion) onDismissSuggestion()
        }}
        onPaste={event => {
          onPaste?.(event)
          if (event.defaultPrevented || !onValueChange || composing || props.disabled || props.readOnly || event.clipboardData.files?.length) return
          const text = event.clipboardData.getData('text/plain')
          if (!shouldFoldPaste(text)) return
          event.preventDefault()
          const next = editVisibleDraft(raw, fold, event.currentTarget.selectionStart, event.currentTarget.selectionEnd, text)
          // Keep the old block as normal text when a new long paste is collapsed.
          setFold({ raw: next.raw, start: next.insertion, end: next.insertion + text.length, scope: draftScope })
          onValueChange(next.raw, next.caret)
          onDismissSuggestion()
          requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.insertion, next.insertion))
        }}
        onCompositionStart={event => { setComposing(true); onCompositionStart?.(event) }}
        onCompositionEnd={event => { setComposing(false); onCompositionEnd?.(event) }}
        onKeyDown={event => {
          if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return
          onKeyDown?.(event)
          if (!visible || event.defaultPrevented) return
          if (event.key === 'Escape') {
            event.preventDefault()
            onDismissSuggestion()
          } else if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault()
            onAcceptSuggestion(suggestion!)
          }
        }}
      />
      {visible && compact && <span id={hintId} className="sr-only">续问建议可从更多功能采纳，或按 Tab 采纳。</span>}
      {visible && !compact && (
        <div id={hintId} className="flex justify-end px-1 pb-1 md:px-2">
          <button type="button" onClick={() => onAcceptSuggestion(suggestion!)}
            title={suggestion!} aria-label="采纳续问建议"
            className="inline-flex min-h-8 items-center gap-2 rounded px-2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            <kbd className="hidden rounded border px-1 py-0.5 text-[10px] md:inline">Tab</kbd>
            采纳建议
          </button>
        </div>
      )}
    </div>
  )
})
