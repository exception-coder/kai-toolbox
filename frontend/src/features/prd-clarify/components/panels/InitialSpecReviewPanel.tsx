import { useEffect, useState } from 'react'
import { Check, Eye, Loader2, Pencil, Save } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'

interface InitialSpecReviewPanelProps {
  content: string
  onSave: (content: string) => Promise<void>
  onConfirm: (content: string) => Promise<void>
}

/** 审阅探索产出的初始化规格，并确认生成核心规格。 */
export function InitialSpecReviewPanel({ content, onSave, onConfirm }: InitialSpecReviewPanelProps) {
  const [draft, setDraft] = useState(content)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(content), [content])

  const run = async (action: 'save' | 'confirm') => {
    setError(null)
    action === 'save' ? setSaving(true) : setConfirming(true)
    try {
      if (action === 'save') {
        await onSave(draft)
      } else {
        await onConfirm(draft)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请重试')
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-hidden px-6 py-6 md:px-10">
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
              Initial specification
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">审阅初始化规格</h1>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              核对探索结论、关键 DDL 和开放事项。你可以直接编辑；确认后将生成核心规格，不再进入问答澄清。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
            >
              {editing ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editing ? '预览' : '编辑'}
            </button>
            <button
              type="button"
              disabled={saving || confirming || !draft.trim()}
              onClick={() => run('save')}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </button>
            <button
              type="button"
              disabled={saving || confirming || !draft.trim()}
              onClick={() => run('confirm')}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              确认并生成规格
            </button>
          </div>
        </header>

        {error && <p className="border-b border-red-500/20 py-3 text-sm text-red-500">{error}</p>}

        <section className="min-h-0 flex-1 overflow-y-auto py-5">
          {editing ? (
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-full min-h-[520px] w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 font-mono text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
              spellCheck={false}
            />
          ) : (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-5">
              <MarkdownContent content={draft} />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
