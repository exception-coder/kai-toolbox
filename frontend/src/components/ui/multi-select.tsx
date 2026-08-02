import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from './popover'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  label: string
  value: string
  /** 分组标签（如所属项目名）。存在时下拉列表按分组展示二级标题；不带 group 的选项按原样平铺，
   *  组内顺序跟随 options 数组本身的顺序（组件不做二次排序）。 */
  group?: string
}

export interface MultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  options: MultiSelectOption[]
  placeholder?: string
  id?: string
  className?: string
  emptyText?: string
  allowCustom?: boolean
  clearable?: boolean
}

/**
 * 多选下拉：候选项支持勾选（复选框列表，点击只切换勾选不关闭下拉，方便连续多选）；
 * 也支持在输入框里直接打字，回车/逗号/顿号把不在候选列表里的自定义值加成一个 chip
 * （如手填一个候选列表未收录的模块名）。已选项以可移除的 chips 展示在输入框内，
 * 输入框为空时按退格删除最后一个 chip，跟主流标签输入交互一致。
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder,
  id,
  className,
  emptyText = '没有匹配的候选项',
  allowCustom = true,
  clearable = true,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // 候选层通过 Portal 渲染，不属于输入框的 DOM 子树。在捕获阶段同时检查输入区与
  // Portal 内容，确保嵌套在 Dialog、Sheet 等容器中时，点击其它区域也能可靠收起。
  React.useEffect(() => {
    if (!open) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) || contentRef.current?.contains(target)) return
      setOpen(false)
      setDraft('')
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  }, [open])

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }
  const removeTag = (v: string) => onChange(value.filter((x) => x !== v))
  const commitDraft = () => {
    const trimmed = draft.trim()
    if (allowCustom && trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setDraft('')
  }

  const filtered = React.useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, draft])

  // 按 group 分桶，保留 options 原始顺序（同一 group 的选项在源数组里不要求相邻，这里会
  // 按"第一次出现该 group"的位置归并，不强制调用方预先排序）。group 为 undefined 的选项
  // 各自单独成桶（不分组的照旧一项项平铺，不会被拼到同一个"未分组"大桶里打乱原有顺序）。
  const groupedFiltered = React.useMemo(() => {
    const groups: { group?: string; items: MultiSelectOption[] }[] = []
    const indexByGroup = new Map<string, number>()
    for (const o of filtered) {
      if (o.group === undefined) {
        groups.push({ group: undefined, items: [o] })
        continue
      }
      let idx = indexByGroup.get(o.group)
      if (idx === undefined) {
        idx = groups.length
        indexByGroup.set(o.group, idx)
        groups.push({ group: o.group, items: [] })
      }
      groups[idx].items.push(o)
    }
    return groups
  }, [filtered])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={rootRef}
          className={cn(
            'flex flex-wrap items-center gap-1 min-h-9 w-full px-2 py-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm cursor-text focus-within:ring-1 focus-within:ring-[var(--color-ring)]',
            className,
          )}
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-options` : undefined}
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
            placeholder={value.length ? '' : placeholder}
            autoComplete="off"
            className="flex-1 min-w-[80px] bg-transparent outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
          {clearable && value.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                onChange([])
                inputRef.current?.focus()
              }}
              className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              aria-label="清空全部已选项"
              title="清空全部"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted-foreground)] shrink-0" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        id={id ? `${id}-options` : undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[var(--radix-popover-trigger-width)] max-h-56 overflow-y-auto p-1"
      >
        {filtered.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-[var(--color-muted-foreground)]">
            {draft.trim() && allowCustom ? `回车添加自定义值 "${draft.trim()}"` : emptyText}
          </div>
        ) : (
          groupedFiltered.map((g, gi) => (
            <div key={g.group ?? `_ungrouped_${gi}`}>
              {g.group && (
                <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  {g.group}
                </div>
              )}
              {g.items.map((o) => {
                const checked = value.includes(o.value)
                return (
                  <button
                    key={`${o.group ?? ''}:${o.value}:${o.label}`}
                    type="button"
                    role="option"
                    aria-selected={checked}
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
              })}
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}
