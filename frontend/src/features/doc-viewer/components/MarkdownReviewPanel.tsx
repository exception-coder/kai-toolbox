import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleAlert, MessageSquarePlus, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { createReviewNote, deleteReviewNote, listReviewNotes, updateReviewNote } from '../api'
import type { ReviewNoteCategory, ReviewNoteDTO } from '../types'
import { TocPanel, type TocEntry } from './TocPanel'

interface MarkdownReviewPanelProps {
  rootRef: React.RefObject<HTMLDivElement | null>
  contentKey: string
  sourceId: string
  filePath: string
}

const CATEGORY_LABEL: Record<ReviewNoteCategory, string> = {
  CLARIFICATION: '待明确',
  DISPUTE: '有异议',
  FOLLOW_UP: '待跟进',
}

export function MarkdownReviewPanel(props: MarkdownReviewPanelProps) {
  const { rootRef, contentKey, sourceId, filePath } = props
  const queryClient = useQueryClient()
  const queryKey = ['doc-viewer-review-notes', sourceId, filePath]
  const [tab, setTab] = useState<'outline' | 'notes'>('outline')
  const [entries, setEntries] = useState<TocEntry[]>([])
  const [editing, setEditing] = useState<ReviewNoteDTO | null>(null)
  const [heading, setHeading] = useState<TocEntry | null>(null)
  const [category, setCategory] = useState<ReviewNoteCategory>('CLARIFICATION')
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [content, heading])

  const notesQuery = useQuery({
    queryKey,
    queryFn: () => listReviewNotes(sourceId, filePath),
    enabled: !!sourceId && !!filePath,
  })
  const notes = notesQuery.data ?? []
  const openCount = notes.filter(note => note.status === 'OPEN').length
  const entryIds = useMemo(() => new Set(entries.map(entry => entry.id)), [entries])

  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const createMutation = useMutation({
    mutationFn: () => createReviewNote(sourceId, {
      filePath,
      headingId: heading?.id ?? '',
      headingText: heading?.text ?? '',
      headingLevel: heading?.level ?? 0,
      category,
      content,
    }),
    onSuccess: () => {
      resetForm()
      setTab('notes')
      refresh()
    },
  })
  const updateMutation = useMutation({
    mutationFn: (payload: { note: ReviewNoteDTO; status?: 'OPEN' | 'RESOLVED' }) =>
      updateReviewNote(sourceId, payload.note.id, {
        category: editing?.id === payload.note.id ? category : payload.note.category,
        content: editing?.id === payload.note.id ? content : payload.note.content,
        status: payload.status ?? payload.note.status,
      }),
    onSuccess: () => {
      resetForm()
      refresh()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteReviewNote(sourceId, noteId),
    onSuccess: refresh,
  })

  function resetForm() {
    setHeading(null)
    setEditing(null)
    setCategory('CLARIFICATION')
    setContent('')
  }

  function startCreate(entry: TocEntry) {
    setEditing(null)
    setHeading(entry)
    setCategory('CLARIFICATION')
    setContent('')
  }

  function startEdit(note: ReviewNoteDTO) {
    setHeading({ id: note.headingId, text: note.headingText, level: note.headingLevel })
    setEditing(note)
    setCategory(note.category)
    setContent(note.content)
    setTab('notes')
  }

  const requestError = createMutation.error ?? updateMutation.error ?? deleteMutation.error

  return (
    <div className="flex min-h-0 flex-col text-sm">
      <div className="mb-3 grid grid-cols-2 border-b border-[var(--color-border)]">
        <TabButton active={tab === 'outline'} onClick={() => setTab('outline')}>大纲</TabButton>
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>
          备注{openCount > 0 ? ` ${openCount}` : ''}
        </TabButton>
      </div>

      {heading && (
        <form
          className="mb-4 border-b border-[var(--color-border)] pb-4"
          onSubmit={event => {
            event.preventDefault()
            if (!content.trim()) return
            if (editing) updateMutation.mutate({ note: editing })
            else createMutation.mutate()
          }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-[var(--color-muted-foreground)]">{editing ? '编辑备注' : '备注章节'}</div>
              <div className="mt-0.5 line-clamp-2 font-medium">{heading.text}</div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={resetForm} title="取消">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <select
            value={category}
            onChange={event => setCategory(event.target.value as ReviewNoteCategory)}
            className="mb-2 h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            aria-label="备注类型"
          >
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={event => setContent(event.target.value)}
            maxLength={4000}
            rows={4}
            autoFocus
            placeholder="记录待补全的信息、异议或后续动作…"
            className="max-h-[50vh] min-h-24 w-full resize-none overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-muted-foreground)]">{content.length}/4000</span>
            <Button type="submit" size="sm" disabled={!content.trim() || createMutation.isPending || updateMutation.isPending}>
              {editing ? '保存修改' : '添加备注'}
            </Button>
          </div>
        </form>
      )}

      {requestError && (
        <div className="mb-3 flex gap-2 text-xs text-[var(--color-destructive)]">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {requestError instanceof ApiError ? requestError.message : String(requestError)}
        </div>
      )}

      {tab === 'outline' ? (
        <TocPanel
          rootRef={rootRef}
          contentKey={contentKey}
          showLabel={false}
          onEntriesChange={setEntries}
          renderTrailingAction={entry => {
            const count = notes.filter(note => note.headingId === entry.id && note.status === 'OPEN').length
            return (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => startCreate(entry)}
                title={`给“${entry.text}”添加备注`}
              >
                {count > 0 ? <span className="text-[10px] font-semibold">{count}</span> : <MessageSquarePlus className="h-3.5 w-3.5" />}
              </Button>
            )
          }}
        />
      ) : notesQuery.isLoading ? (
        <div className="text-xs text-[var(--color-muted-foreground)]">加载备注…</div>
      ) : notes.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--color-muted-foreground)]">
          暂无备注，可从“大纲”选择章节添加。
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {notes.map(note => {
            const matched = entryIds.has(note.headingId)
            return (
              <article key={note.id} className={cn('py-3', note.status === 'RESOLVED' && 'opacity-60')}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[note.category]}</Badge>
                  {note.status === 'RESOLVED' && <span className="text-[10px] text-[var(--color-muted-foreground)]">已解决</span>}
                </div>
                <button
                  type="button"
                  disabled={!matched}
                  onClick={() => document.getElementById(note.headingId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="line-clamp-2 text-left text-xs font-medium hover:underline disabled:cursor-default disabled:no-underline"
                  title={matched ? '定位到正文' : '原章节已变更，暂时无法定位'}
                >
                  {note.headingText}{!matched && '（章节已变更）'}
                </button>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5">{note.content}</p>
                <div className="mt-2 flex items-center gap-1">
                  <NoteAction title="编辑" onClick={() => startEdit(note)}><Pencil /></NoteAction>
                  <NoteAction
                    title={note.status === 'OPEN' ? '标记已解决' : '重新打开'}
                    onClick={() => updateMutation.mutate({ note, status: note.status === 'OPEN' ? 'RESOLVED' : 'OPEN' })}
                  >
                    {note.status === 'OPEN' ? <Check /> : <RotateCcw />}
                  </NoteAction>
                  <NoteAction
                    title="删除"
                    onClick={() => {
                      if (window.confirm('确定删除这条审阅备注？')) deleteMutation.mutate(note.id)
                    }}
                  ><Trash2 /></NoteAction>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'border-b-2 px-2 pb-2 text-xs font-medium transition-colors',
        props.active
          ? 'border-[var(--color-primary)] text-[var(--color-foreground)]'
          : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
      )}
    >{props.children}</button>
  )
}

function NoteAction(props: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={props.title} onClick={props.onClick}>
      {props.children}
    </Button>
  )
}
