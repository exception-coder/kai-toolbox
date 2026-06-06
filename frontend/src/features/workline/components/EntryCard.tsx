import { useState } from 'react'
import { ChevronDown, ChevronRight, ListPlus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EntryView } from '../types'

interface Props {
  entry: EntryView
  /** 是否为明细子条目（子条目不再嵌套、不再加子项） */
  isChild?: boolean
  onEdit: (entry: EntryView) => void
  onDelete: (entry: EntryView) => void
  onAddChild?: (parent: EntryView) => void
}

export function EntryCard({ entry, isChild = false, onEdit, onDelete, onAddChild }: Props) {
  const [expanded, setExpanded] = useState(false)
  const childCount = entry.children?.length ?? 0

  return (
    <div
      className={cn(
        'rounded-lg border bg-[var(--color-card)] shadow-sm',
        isChild ? 'border-l-2 border-l-[var(--color-primary)]/40 p-3' : 'p-4',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn('min-w-0 flex-1 font-semibold', isChild && 'text-sm')}>{entry.title}</h3>
        <div className="flex shrink-0 gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(entry)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(entry)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {entry.coreContent && <Section label="核心内容" text={entry.coreContent} />}
      {entry.achievement && <Section label="成果" text={entry.achievement} />}

      {!isChild && (
        <div className="mt-3 flex items-center gap-2 border-t pt-2">
          {childCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              详情 {childCount}
            </Button>
          )}
          {onAddChild && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-[var(--color-muted-foreground)]"
              onClick={() => onAddChild(entry)}
            >
              <ListPlus className="size-3.5" />
              加明细
            </Button>
          )}
        </div>
      )}

      {!isChild && expanded && childCount > 0 && (
        <div className="mt-2 space-y-2 pl-2">
          {entry.children.map(child => (
            <EntryCard key={child.id} entry={child} isChild onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  )
}
