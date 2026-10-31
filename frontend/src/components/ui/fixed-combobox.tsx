import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { cn } from '@/lib/utils'
import type { ComboboxProps } from './combobox'

/** 既有Combobox的固定候选呈现；使用同一Popover与主题，不依赖浏览器datalist。 */
export function FixedCombobox({ value, onChange, options, placeholder = '请选择', emptyText = '暂无可选项', id,
  className, contentClassName, disabled = false, autoFocus, searchable = false, 'aria-label': ariaLabel }: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const listId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.value === value)
  const filtered = options.filter(option => !searchable || `${option.label} ${option.value}`.toLowerCase().includes(search.trim().toLowerCase()))
  const label = selected?.label ?? (value ? `${value} · 历史值` : placeholder)
  const moveFocus = (event: KeyboardEvent) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    if (!items.length) return
    const index = items.findIndex(item => item === document.activeElement)
    let target: number
    switch (event.key) {
      case 'ArrowDown': target = (index + 1) % items.length; break
      case 'ArrowUp': target = (index - 1 + items.length) % items.length; break
      case 'Home': target = 0; break
      case 'End': target = items.length - 1; break
      default: return
    }
    event.preventDefault()
    items[target]?.focus()
  }
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch('') }}>
    <PopoverTrigger asChild>
      <button ref={trigger} type="button" id={id} role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        disabled={disabled} autoFocus={autoFocus} title={label}
        onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}
        className={cn('flex min-h-[var(--density-control-height)] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50', className)}>
        <span className={cn('min-w-0 truncate', !value && 'text-muted-foreground')}>{label}</span><ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent className={cn('w-[var(--radix-popover-trigger-width)] min-w-48 max-w-[var(--radix-popover-content-available-width)] max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto p-1', contentClassName)}
      onOpenAutoFocus={event => { event.preventDefault(); (searchable ? searchInput.current : list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLButtonElement>('[role="option"]'))?.focus() }}>
      {searchable && <input ref={searchInput} type="search" aria-label={`搜索${ariaLabel ?? '候选项'}`} value={search} autoComplete="off"
        placeholder="搜索…" onChange={event => setSearch(event.target.value)}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); list.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus() } }}
        className="mb-1 h-10 w-full rounded-sm border bg-[var(--color-background)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />}
      <div ref={list} id={listId} role="listbox" aria-label={ariaLabel} onKeyDown={moveFocus}>
        {!filtered.length && <p role="status" className="px-2 py-2 text-xs text-muted-foreground">{emptyText}</p>}
        {filtered.map((option, index) => <button type="button" key={option.value} role="option" aria-selected={option.value === value}
          tabIndex={option.value === value || (!selected && index === 0) ? 0 : -1}
          onClick={() => { if (!trigger.current?.matches(':disabled')) onChange(option.value); setOpen(false); setSearch('') }}
          className={cn('flex min-h-10 w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-[var(--color-accent)] focus:bg-[var(--color-accent)]', option.value === value && 'text-[var(--color-primary)]')}>
          <Check aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', option.value !== value && 'opacity-0')} /><span className="min-w-0 break-words">{option.label}</span>
        </button>)}
      </div>
    </PopoverContent>
  </Popover>
}
