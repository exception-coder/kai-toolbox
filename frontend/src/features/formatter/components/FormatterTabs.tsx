import { useRef } from 'react'
import { cn } from '@/lib/utils'

export const FORMAT_OPTIONS = [
  { value: 'java', label: 'Java 代码' }, { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' }, { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' }, { value: 'nginx', label: 'Nginx' },
] as const
export type FormatTab = typeof FORMAT_OPTIONS[number]['value']

export function FormatterTabs({ value, onChange }: { value: FormatTab; onChange: (value: FormatTab) => void }) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  return <div role="tablist" aria-label="格式类型" className="flex shrink-0 gap-4 overflow-x-auto border-b">
    {FORMAT_OPTIONS.map((option, index) => <button key={option.value} type="button" role="tab"
      id={`format-tab-${option.value}`} aria-controls={`format-panel-${option.value}`}
      aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1}
      ref={node => { if (node) refs.current.set(option.value, node); else refs.current.delete(option.value) }}
      onClick={() => onChange(option.value)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % FORMAT_OPTIONS.length : event.key === 'ArrowLeft' ? (index - 1 + FORMAT_OPTIONS.length) % FORMAT_OPTIONS.length : event.key === 'Home' ? 0 : event.key === 'End' ? FORMAT_OPTIONS.length - 1 : null
        if (next === null) return
        event.preventDefault(); onChange(FORMAT_OPTIONS[next].value); refs.current.get(FORMAT_OPTIONS[next].value)?.focus()
      }} className={cn('shrink-0 border-b-2 px-1 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        value === option.value ? 'border-[var(--color-primary)] font-medium' : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')}>
      {option.label}
    </button>)}
  </div>
}
