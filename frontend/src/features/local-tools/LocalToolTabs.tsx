import { useRef } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  tools: { id: string; name: string }[]
  selected?: string
  onSelect: (id: string) => void
}

export function LocalToolTabs({ tools, selected, onSelect }: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  return <div role="tablist" aria-label="本机工具" className="flex shrink-0 gap-5 overflow-x-auto border-b px-5 sm:px-6">
    {tools.map((tool, index) => <button
      key={tool.id} type="button" role="tab" id={`local-tab-${tool.id}`}
      aria-selected={selected === tool.id} aria-controls={`local-panel-${tool.id}`}
      tabIndex={selected === tool.id || (!selected && index === 0) ? 0 : -1}
      ref={node => { if (node) buttons.current.set(tool.id, node); else buttons.current.delete(tool.id) }}
      onClick={() => onSelect(tool.id)}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tools.length
          : event.key === 'ArrowLeft' ? (index - 1 + tools.length) % tools.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tools.length - 1 : null
        if (next === null) return
        event.preventDefault()
        buttons.current.get(tools[next].id)?.focus()
      }}
      className={cn('shrink-0 border-b-2 px-1 py-3 text-sm transition-colors hover:text-[var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        selected === tool.id ? 'border-[var(--color-primary)] font-medium' : 'border-transparent text-[var(--color-muted-foreground)]')}
    >{tool.name}</button>)}
  </div>
}
