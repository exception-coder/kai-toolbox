// 列表型表单编辑器：通用增删改 + 排序，支持工作经历 / 项目经历 / 教育经历。
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-react'

interface ListEditorProps<T> {
  items: T[]
  onChange: (next: T[]) => void
  /** 新建一条目时返回的初始值 */
  create: () => T
  /** 每一项的编辑面板 */
  renderItem: (item: T, onItemChange: (next: T) => void) => React.ReactNode
  /** 列表项展示的标题，用于折叠头 */
  titleOf: (item: T) => string
  emptyLabel?: string
  addLabel?: string
}

export function ListEditor<T extends { id: string }>({
  items,
  onChange,
  create,
  renderItem,
  titleOf,
  emptyLabel = '暂无条目',
  addLabel = '新增',
}: ListEditorProps<T>) {
  function add() {
    onChange([...items, create()])
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= items.length) return
    const next = items.slice()
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  function patch(idx: number, next: T) {
    const arr = items.slice()
    arr[idx] = next
    onChange(arr)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.length === 0 && (
        <button
          type="button"
          onClick={add}
          className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-primary)]/35 bg-[var(--color-primary)]/5 px-4 py-6 text-center text-sm font-medium text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
            <Plus className="h-4 w-4" />
          </span>
          <span>{addLabel}</span>
          <span className="text-xs font-normal text-[var(--color-muted-foreground)]">{emptyLabel}</span>
        </button>
      )}

      {items.map((item, idx) => (
        <details
          key={item.id}
          open={idx === 0}
          className="group overflow-hidden rounded-lg border bg-[var(--color-background)] open:border-[var(--color-primary)]/35 open:shadow-sm"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm hover:bg-[var(--color-accent)]/45 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-open:rotate-90" />
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[10px] font-semibold text-[var(--color-primary)]">
              {idx + 1}
            </span>
            <span className="flex-1 truncate font-medium">
              {titleOf(item) || <span className="text-[var(--color-muted-foreground)] font-normal">（点击展开填写）</span>}
            </span>
            <button
              type="button"
              className="rounded-md p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-30"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                move(idx, -1)
              }}
              disabled={idx === 0}
              title="上移"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-30"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                move(idx, 1)
              }}
              disabled={idx === items.length - 1}
              title="下移"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                remove(idx)
              }}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </summary>
          <div className="border-t px-3 py-3">
            {renderItem(item, next => patch(idx, next))}
          </div>
        </details>
      ))}

      {items.length > 0 && (
        <button
          type="button"
          onClick={add}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-primary)]/35 bg-[var(--color-primary)]/5 py-3 text-sm font-medium text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      )}
    </div>
  )
}

/** 多行文本编辑器：一行一条，自动去掉空行 */
export function MultiLineInput({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value.join('\n')}
      onChange={e => onChange(e.target.value.split('\n'))}
      onBlur={e => onChange(e.target.value.split('\n').map(s => s.trimEnd()).filter((s, i, arr) => !(s === '' && i === arr.length - 1)))}
      placeholder={placeholder ?? '每行一条…'}
      rows={rows}
      className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
    />
  )
}

/** 简单标签输入框：逗号或换行分隔的技能列表 */
export function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  return (
    <Input
      value={value.join(', ')}
      onChange={e => onChange(e.target.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean))}
      placeholder={placeholder ?? '逗号分隔，例如：Java, Spring, Redis'}
    />
  )
}
