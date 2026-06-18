import { useState } from 'react'
import { Check, Pin, PinOff, Trash2, Pencil, X } from 'lucide-react'
import type { MemoryView } from '../lib/api'

const CATEGORY_STYLE: Record<string, string> = {
  PREFERENCE: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  BOUNDARY: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  PERSON: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
}

interface Props {
  m: MemoryView
  /** 仅 proposed：确认转 active */
  onConfirm?: () => void
  /** 仅 active：置顶/取消置顶 */
  onTogglePin?: () => void
  onSaveValue: (value: string) => void
  onDelete: () => void
  busy?: boolean
}

/** 一条记忆卡片：类目徽章 + 键/值/备注 + 操作（确认/编辑/置顶/删除）。仿 NoteCard 风格。 */
export function MemoryCard({ m, onConfirm, onTogglePin, onSaveValue, onDelete, busy }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.value)

  const save = () => {
    const v = draft.trim()
    if (v && v !== m.value) onSaveValue(v)
    setEditing(false)
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${CATEGORY_STYLE[m.category] ?? ''}`}>
          {m.categoryLabel}
        </span>
        <span className="min-w-0 truncate text-sm font-medium" title={m.key}>{m.key}</span>
        {m.pinned && <Pin className="size-3.5 shrink-0 text-[var(--color-primary)]" />}
        <span className="ml-auto shrink-0 text-xs text-[var(--color-muted-foreground)]">
          {Math.round((m.confidence ?? 0) * 100)}%
        </span>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={save} className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-xs text-[var(--color-primary-foreground)]">保存</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(m.value) }} className="rounded-md border px-3 py-1 text-xs">取消</button>
          </div>
        </div>
      ) : (
        <p className="mt-1 break-words text-sm text-[var(--color-foreground)] [overflow-wrap:anywhere]">{m.value}</p>
      )}
      {m.detail && !editing && (
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)] [overflow-wrap:anywhere]">{m.detail}</p>
      )}

      {!editing && (
        <div className="mt-2 flex items-center gap-1">
          {onConfirm && (
            <button type="button" onClick={onConfirm} disabled={busy}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
              <Check className="size-3.5" /> 确认
            </button>
          )}
          <button type="button" onClick={() => setEditing(true)} disabled={busy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]">
            <Pencil className="size-3.5" /> 编辑
          </button>
          {onTogglePin && (
            <button type="button" onClick={onTogglePin} disabled={busy}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]">
              {m.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              {m.pinned ? '取消置顶' : '置顶'}
            </button>
          )}
          <button type="button" onClick={onDelete} disabled={busy}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-muted)]">
            {onConfirm ? <><X className="size-3.5" /> 忽略</> : <><Trash2 className="size-3.5" /> 删除</>}
          </button>
        </div>
      )}
    </div>
  )
}
