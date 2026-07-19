import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from './popover'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  label: string
  value: string
}

export interface MultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  options: MultiSelectOption[]
  placeholder?: string
  id?: string
  className?: string
}

/**
 * 多选下拉：候选项支持勾选（复选框列表，点击只切换勾选不关闭下拉，方便连续多选）；
 * 也支持在输入框里直接打字，回车/逗号/顿号把不在候选列表里的自定义值加成一个 chip
 * （如手填一个候选列表未收录的模块名）。已选项以可移除的 chips 展示在输入框内，
 * 输入框为空时按退格删除最后一个 chip，跟主流标签输入交互一致。
 */
export function MultiSelect({ value, onChange, options, placeholder, id, className }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }
  const removeTag = (v: string) => onChange(value.filter((x) => x !== v))
  const commitDraft = () => {
    const trimmed = draft.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setDraft('')
  }

  const filtered = React.useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, draft])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 min-h-9 w-full px-2 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm cursor-text focus-within:ring-1 focus-within:ring-[var(--color-ring)]',
            className,
          )}
          onClick={() => { setOpen(true); inputRef.current?.focus() }}
        >
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20"
            >
              {v}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(v) }}
                className="rounded-full hover:bg-[var(--color-primary)]/20 p-0.5"
                aria-label={`移除 ${v}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <input
            id={id}
            ref={inputRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、') {
                e.preventDefault()
                commitDraft()
              } else if (e.key === 'Backspace' && !draft && value.length > 0) {
                removeTag(value[value.length - 1])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            onBlur={commitDraft}
            placeholder={value.length ? '' : placeholder}
            autoComplete="off"
            className="flex-1 min-w-[80px] bg-transparent outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted-foreground)] shrink-0" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[var(--radix-popover-trigger-width)] max-h-56 overflow-y-auto p-1"
      >
        {filtered.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-[var(--color-muted-foreground)]">
            {draft.trim() ? `回车添加自定义值 "${draft.trim()}"` : '无候选模块'}
          </div>
        ) : (
          filtered.map((o) => {
            const checked = value.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-4 h-4 rounded border shrink-0',
                    checked
                      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'border-[var(--color-border)]',
                  )}
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
                {o.label}
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
