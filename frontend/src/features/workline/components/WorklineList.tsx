import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { WorklineView } from '../types'

interface Props {
  lines: WorklineView[]
  selectedId: number | null
  saving: boolean
  onSelect: (id: number) => void
  onCreate: (name: string) => void
  onRename: (id: number, name: string) => void
  onDelete: (line: WorklineView) => void
}

export function WorklineList({
  lines,
  selectedId,
  saving,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  function submitCreate() {
    const name = newName.trim()
    if (!name) return
    onCreate(name)
    setNewName('')
    setCreating(false)
  }

  function submitRename(id: number) {
    const name = editName.trim()
    if (!name) return
    onRename(id, name)
    setEditingId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          工作线 · {lines.length}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setCreating(v => !v)}>
          <Plus />
          新建
        </Button>
      </div>

      {creating && (
        <div className="mb-2 flex items-center gap-1">
          <Input
            autoFocus
            value={newName}
            placeholder="工作线名称"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitCreate()
              if (e.key === 'Escape') setCreating(false)
            }}
          />
          <Button size="icon" variant="outline" disabled={saving} onClick={submitCreate}>
            <Check />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setCreating(false)}>
            <X />
          </Button>
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto">
        {lines.length === 0 && !creating && (
          <p className="px-2 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
            还没有工作线，点「新建」开始。
          </p>
        )}
        {lines.map(line =>
          editingId === line.id ? (
            <div key={line.id} className="flex items-center gap-1">
              <Input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitRename(line.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
              <Button size="icon" variant="outline" disabled={saving} onClick={() => submitRename(line.id)}>
                <Check />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                <X />
              </Button>
            </div>
          ) : (
            <div
              key={line.id}
              className={cn(
                'group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm transition-colors',
                selectedId === line.id
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'hover:bg-[var(--color-muted)]/50',
              )}
              onClick={() => onSelect(line.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{line.name}</div>
                {line.description && (
                  <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                    {line.description}
                  </div>
                )}
              </div>
              <span className="ml-2 shrink-0 text-xs text-[var(--color-muted-foreground)]">
                {line.entryCount}
              </span>
              <div className="ml-1 hidden shrink-0 gap-0.5 group-hover:flex">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={e => {
                    e.stopPropagation()
                    setEditingId(line.id)
                    setEditName(line.name)
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={e => {
                    e.stopPropagation()
                    onDelete(line)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
