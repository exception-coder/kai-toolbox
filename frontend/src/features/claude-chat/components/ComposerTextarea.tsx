import { forwardRef, useId, useState, type ComponentPropsWithoutRef } from 'react'

interface Props extends ComponentPropsWithoutRef<'textarea'> {
  suggestion?: string | null
  onAcceptSuggestion: (text: string) => void
  onDismissSuggestion: () => void
}

/** Native suggestions are preview text, never the textarea's value or a send action. */
export const ComposerTextarea = forwardRef<HTMLTextAreaElement, Props>(function ComposerTextarea({
  suggestion, onAcceptSuggestion, onDismissSuggestion, onKeyDown, onChange,
  onCompositionStart, onCompositionEnd, rows, ...props
}, ref) {
  const hintId = useId()
  const [composing, setComposing] = useState(false)
  const visible = Boolean(suggestion && props.value === '' && !props.disabled && !composing)
  return (
    <div className="col-span-3 row-start-1 min-w-0">
      <textarea
        {...props}
        ref={ref}
        placeholder={visible ? suggestion! : props.placeholder}
        aria-describedby={visible ? hintId : props['aria-describedby']}
        rows={visible ? 2 : rows}
        onChange={event => {
          onChange?.(event)
          if (event.target.value && suggestion) onDismissSuggestion()
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
      {visible && (
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
