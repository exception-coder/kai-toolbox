import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from './popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  label: string
  value: string
}

export interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyText?: string
  id?: string
  className?: string
}

/**
 * 可编辑单选下拉：输入框本身可自由输入（不限于候选项，如手动填一个不在列表里的项目名），
 * 同时提供候选项下拉列表点选，输入内容会实时过滤候选项。
 *
 * 替代原生 `<input list> + <datalist>`——原生方案在 Chrome 等浏览器上会被「已保存的表单
 * 数据」自动填充抢先展示（样式是浏览器自己的、不可控，内容也是历史输入痕迹而非我们的
 * 候选项），体验混乱且不符合本项目自有控件体系。
 */
export function Combobox({ value, onChange, options, placeholder, emptyText = '无匹配项', id, className }: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const filtered = React.useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <input
            id={id}
            ref={inputRef}
            value={value}
            onChange={(e) => { onChange(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full px-3 py-2 pr-8 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => { setOpen((o) => !o); inputRef.current?.focus() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
            aria-label="展开候选列表"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[var(--radix-popover-trigger-width)] max-h-56 overflow-y-auto p-1"
      >
        {filtered.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-[var(--color-muted-foreground)]">{emptyText}</div>
        ) : (
          filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]',
                o.value === value && 'text-[var(--color-primary)]',
              )}
            >
              <Check className={cn('w-3.5 h-3.5 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} />
              {o.label}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}
