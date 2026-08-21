import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ClipboardList, Loader2, MessageSquareText, Pencil, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Markdown, type PublicReviewRequirement } from '@/features/claude-chat/public-api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PublicReviewRequirement[]
  loading: boolean
  syncing: boolean
  error: string | null
  busyIds: Set<string>
  onReload: () => void
  onSave: (item: PublicReviewRequirement, title: string, content: string) => Promise<boolean>
  onDelete: (item: PublicReviewRequirement) => Promise<boolean>
}

export function ReviewRequirementList({ open, onOpenChange, items, loading, syncing, error,
  busyIds, onReload, onSave, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setDeleteConfirmId(null)
      setExpandedSourceIds(new Set())
    }
  }, [open])

  const beginEdit = (item: PublicReviewRequirement) => {
    setEditingId(item.id)
    setTitle(item.title)
    setContent(item.content)
    setDeleteConfirmId(null)
  }

  const save = async (item: PublicReviewRequirement) => {
    if (!title.trim() || !content.trim()) return
    if (await onSave(item, title.trim(), content.trim())) setEditingId(null)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-none flex-col p-0 sm:w-[34rem] sm:max-w-[90vw]">
        <div className="border-b px-5 py-4 pr-12">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-[var(--color-primary)]" />
            <SheetTitle>当前评审需求清单</SheetTitle>
          </div>
          <SheetDescription className="mt-1">
            这里只保留 AI 归并后的当前有效需求；用户原话可在需求来源中追溯。
          </SheetDescription>
        </div>

        {error && (
          <div className="mx-4 mt-3 flex items-start gap-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={onReload} className="inline-flex shrink-0 items-center gap-1 font-medium">
              <RefreshCw className="size-3.5" />刷新
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" />正在读取需求清单…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-medium">还没有识别到业务需求</p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">继续提出需求，AI 会结合上下文新建、合并或修订当前清单。</p>
            </div>
          ) : (
            <ol className="divide-y divide-[var(--color-border)]">
              {items.map((item, index) => {
                const busy = busyIds.has(item.id)
                const editing = editingId === item.id
                const sources = item.sources ?? []
                const sourcesExpanded = expandedSourceIds.has(item.id)
                return (
                  <li key={item.id} className="py-4 first:pt-1">
                    <div className="mb-2 flex items-start gap-3">
                      <span className="mt-0.5 text-xs font-semibold tabular-nums text-[var(--color-muted-foreground)]">{String(index + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <input value={title} maxLength={120} onChange={event => setTitle(event.target.value)}
                            aria-label="需求标题" className="w-full border-b bg-transparent pb-1 font-semibold outline-none focus:border-[var(--color-primary)]" />
                        ) : <h3 className="font-semibold leading-6">{item.title}</h3>}
                      </div>
                      {!editing && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="icon" variant="ghost" className="size-8" onClick={() => beginEdit(item)} disabled={busy} title="修改需求" aria-label={`修改需求：${item.title}`}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="sm" variant={deleteConfirmId === item.id ? 'destructive' : 'ghost'}
                            className="h-8 px-2" disabled={busy}
                            aria-label={deleteConfirmId === item.id ? `确认删除需求：${item.title}` : `删除需求：${item.title}`}
                            onClick={() => {
                              if (deleteConfirmId !== item.id) setDeleteConfirmId(item.id)
                              else void onDelete(item).then(ok => { if (ok) setDeleteConfirmId(null) })
                            }}>
                            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            {deleteConfirmId === item.id && <span className="ml-1">确认删除</span>}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="pl-8">
                      {editing ? (
                        <>
                          <textarea value={content} maxLength={10000} onChange={event => setContent(event.target.value)}
                            aria-label="需求说明" rows={12}
                            className="w-full resize-y rounded-lg border bg-[var(--color-background)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--color-primary)]" />
                          <div className="mt-2 flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={busy}><X className="size-4" />取消</Button>
                            <Button size="sm" onClick={() => void save(item)} disabled={busy || !title.trim() || !content.trim()}>
                              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}保存修改
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <Markdown text={item.content} className="text-sm leading-6" />
                          {sources.length > 0 && (
                            <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                              <button type="button"
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                                aria-expanded={sourcesExpanded}
                                onClick={() => setExpandedSourceIds(previous => {
                                  const next = new Set(previous)
                                  if (next.has(item.id)) next.delete(item.id)
                                  else next.add(item.id)
                                  return next
                                })}>
                                <MessageSquareText className="size-3.5" />
                                需求来源 {sources.length} 条
                                <ChevronDown className={`size-3.5 transition-transform ${sourcesExpanded ? 'rotate-180' : ''}`} />
                              </button>
                              {sourcesExpanded && (
                                <ol className="mt-3 space-y-3 border-l border-[var(--color-border)] pl-3">
                                  {sources.map((source, sourceIndex) => (
                                    <li key={source.sourceMessageId} className="text-sm leading-6">
                                      <p className="text-xs text-[var(--color-muted-foreground)]">业务人员 · 来源 {sourceIndex + 1}</p>
                                      <p className="mt-1 whitespace-pre-wrap">{source.sourceText || '该来源仅保留了历史标识。'}</p>
                                      {source.analysisText && (
                                        <details className="mt-1.5 text-[var(--color-muted-foreground)]">
                                          <summary className="cursor-pointer text-xs font-medium">查看关联 AI 分析</summary>
                                          <div className="mt-2 border-l border-[var(--color-border)] pl-3">
                                            <Markdown text={source.analysisText} className="text-xs leading-5" />
                                          </div>
                                        </details>
                                      )}
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-[var(--color-muted-foreground)]">
          <span>{items.length} 项当前有效需求</span>
          {syncing && <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />正在归并新诉求</span>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
