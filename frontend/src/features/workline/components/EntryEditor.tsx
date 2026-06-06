import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EntryUpsert } from '../types'

interface Props {
  value: EntryUpsert
  editing: boolean
  saving: boolean
  /** 覆盖标题文案；不传则按 editing 显示「编辑条目 / 新增条目」 */
  heading?: string
  onChange: (v: EntryUpsert) => void
  onSave: () => void
  onCancel: () => void
}

const textareaCls = cn(
  'flex min-h-24 w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm shadow-sm transition-colors',
  'placeholder:text-[var(--color-muted-foreground)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

export function EntryEditor({ value, editing, saving, heading, onChange, onSave, onCancel }: Props) {
  const canSave = value.title.trim().length > 0
  const title = heading ?? (editing ? '编辑条目' : '新增条目')

  return (
    <div className="space-y-3 rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
      <div className="text-sm font-semibold">{title}</div>

      <div className="space-y-1">
        <label className="text-xs text-[var(--color-muted-foreground)]">标题 *</label>
        <Input
          autoFocus
          value={value.title}
          placeholder="一句话概括这次工作"
          onChange={e => onChange({ ...value, title: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[var(--color-muted-foreground)]">核心内容</label>
        <textarea
          className={textareaCls}
          value={value.coreContent ?? ''}
          placeholder="做了什么、怎么做的、关键决策……"
          onChange={e => onChange({ ...value, coreContent: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-[var(--color-muted-foreground)]">作出的成果</label>
        <textarea
          className={textareaCls}
          value={value.achievement ?? ''}
          placeholder="产出 / 指标 / 影响……"
          onChange={e => onChange({ ...value, achievement: e.target.value })}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" disabled={!canSave || saving} onClick={onSave}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}
