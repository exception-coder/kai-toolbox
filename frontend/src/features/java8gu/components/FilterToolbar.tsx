import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface FilterState {
  search: string
  /** 仅看含代码 */
  onlyCode: boolean
}

interface Props {
  value: FilterState
  onChange: (next: FilterState) => void
  totalCount: number
  visibleCount: number
}

export function FilterToolbar({ value, onChange, totalCount, visibleCount }: Props) {
  const isFiltered = value.search.trim() !== '' || value.onlyCode

  const reset = () =>
    onChange({
      search: '',
      onlyCode: false,
    })

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b bg-[var(--color-background)]/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-background)]/70 sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <Input
            value={value.search}
            onChange={e => onChange({ ...value, search: e.target.value })}
            placeholder="搜索题目"
            className="pl-8"
          />
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11.5px] text-[var(--color-muted-foreground)] sm:border-0 sm:px-1 sm:text-xs">
          <input
            type="checkbox"
            checked={value.onlyCode}
            onChange={e => onChange({ ...value, onlyCode: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
          />
          仅看含代码
        </label>
        <div className="shrink-0 text-xs text-[var(--color-muted-foreground)] tabular-nums">
          <span className="font-semibold text-[var(--color-foreground)]">
            {visibleCount}
          </span>
          <span className="opacity-70"> / {totalCount}</span>
        </div>
        {isFiltered && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            aria-label="重置筛选"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">重置</span>
          </button>
        )}
      </div>
    </div>
  )
}
