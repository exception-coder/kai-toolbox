import { useEffect, useMemo, useState } from 'react'
import { GitBranch, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import {
  useDeleteEntry,
  useDeleteLine,
  useEntries,
  useLines,
  useSaveEntry,
  useSaveLine,
} from '../hooks/useWorkline'
import type { EntryUpsert, EntryView, WorklineView } from '../types'
import { WorklineList } from '../components/WorklineList'
import { EntryCard } from '../components/EntryCard'
import { EntryEditor } from '../components/EntryEditor'

const EMPTY_ENTRY: EntryUpsert = { title: '', coreContent: '', achievement: '' }

export function WorklinePage() {
  const confirm = useConfirm()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<EntryView | null>(null)
  // 非空表示本次是在该父条目下新增明细子条目
  const [childParentId, setChildParentId] = useState<number | null>(null)
  const [form, setForm] = useState<EntryUpsert>(EMPTY_ENTRY)

  const linesQuery = useLines()
  const lines = useMemo(() => linesQuery.data ?? [], [linesQuery.data])

  // 默认选中第一条工作线；当前选中被删后回退到第一条
  useEffect(() => {
    if (lines.length === 0) {
      setSelectedId(null)
    } else if (selectedId == null || !lines.some(l => l.id === selectedId)) {
      setSelectedId(lines[0].id)
    }
  }, [lines, selectedId])

  const entriesQuery = useEntries(selectedId)
  const entries = entriesQuery.data ?? []
  const selectedLine = lines.find(l => l.id === selectedId) ?? null

  const saveLine = useSaveLine()
  const deleteLineMut = useDeleteLine()
  const saveEntry = useSaveEntry(selectedId ?? -1)
  const deleteEntryMut = useDeleteEntry(selectedId ?? -1)

  function withError<T>(p: Promise<T>) {
    setError(null)
    return p.catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : String(e))
    })
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingEntry(null)
    setChildParentId(null)
    setForm(EMPTY_ENTRY)
  }

  function startNewEntry() {
    setEditingEntry(null)
    setChildParentId(null)
    setForm(EMPTY_ENTRY)
    setEditorOpen(true)
  }

  function startAddChild(parent: EntryView) {
    setEditingEntry(null)
    setChildParentId(parent.id)
    setForm(EMPTY_ENTRY)
    setEditorOpen(true)
  }

  function startEditEntry(entry: EntryView) {
    setEditingEntry(entry)
    setChildParentId(null)
    setForm({
      title: entry.title,
      coreContent: entry.coreContent ?? '',
      achievement: entry.achievement ?? '',
    })
    setEditorOpen(true)
  }

  function saveEntryForm() {
    const payload: EntryUpsert =
      !editingEntry && childParentId != null ? { ...form, parentId: childParentId } : form
    withError(
      saveEntry.mutateAsync({ id: editingEntry?.id ?? null, payload }).then(closeEditor),
    )
  }

  async function removeEntry(entry: EntryView) {
    const childNote = entry.children?.length ? `，及其下 ${entry.children.length} 条明细` : ''
    const ok = await confirm({
      title: '删除条目',
      description: `确定删除「${entry.title}」${childNote}？此操作不可撤销。`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (ok) withError(deleteEntryMut.mutateAsync(entry.id))
  }

  async function removeLine(line: WorklineView) {
    const ok = await confirm({
      title: '删除工作线',
      description: `确定删除工作线「${line.name}」？将连带删除其下全部条目，不可撤销。`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (ok) withError(deleteLineMut.mutateAsync(line.id))
  }

  const editorHeading = editingEntry
    ? '编辑条目'
    : childParentId != null
      ? '新增明细子条目'
      : '新增条目'

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-6xl gap-4 p-6">
      {/* 左栏：工作线 */}
      <aside className="w-64 shrink-0 rounded-lg border bg-[var(--color-card)] p-3">
        <WorklineList
          lines={lines}
          selectedId={selectedId}
          saving={saveLine.isPending}
          onSelect={setSelectedId}
          onCreate={name => withError(saveLine.mutateAsync({ id: null, payload: { name } }))}
          onRename={(id, name) => {
            const line = lines.find(l => l.id === id)
            withError(
              saveLine.mutateAsync({
                id,
                payload: { name, description: line?.description ?? undefined },
              }),
            )
          }}
          onDelete={removeLine}
        />
      </aside>

      {/* 右栏：条目 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <GitBranch className="size-5 shrink-0" />
            <span className="truncate">{selectedLine ? selectedLine.name : '工作线'}</span>
          </h1>
          {selectedLine && (
            <Button size="sm" onClick={startNewEntry}>
              <Plus />
              新增条目
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {editorOpen && (
            <EntryEditor
              value={form}
              editing={!!editingEntry}
              heading={editorHeading}
              saving={saveEntry.isPending}
              onChange={setForm}
              onSave={saveEntryForm}
              onCancel={closeEditor}
            />
          )}

          {!selectedLine ? (
            <EmptyHint text="左侧新建一条工作线开始记录。" />
          ) : entries.length === 0 && !editorOpen ? (
            <EmptyHint text="这条工作线还没有记录，点右上角「新增条目」。" />
          ) : (
            entries.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onEdit={startEditEntry}
                onDelete={removeEntry}
                onAddChild={startAddChild}
              />
            ))
          )}
        </div>
      </main>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
      {text}
    </div>
  )
}
