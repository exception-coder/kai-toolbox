import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot,
  Send,
  Loader2,
  Clock,
  Wallet,
  Tag,
  AlertTriangle,
  Network,
  RefreshCw,
  MessageSquareText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { captureNote, listNotes, type NoteView } from '../lib/api'

/** 类目 → 徽章配色（与架构页的类目体系一致） */
const CATEGORY_STYLE: Record<string, string> = {
  TODO: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  SCHEDULE: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  EXPENSE: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  IDEA: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  NOTE: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  UNCATEGORIZED: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function NoteCard({ note }: { note: NoteView }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium',
                CATEGORY_STYLE[note.category] ?? CATEGORY_STYLE.UNCATEGORIZED
              )}
            >
              {note.categoryLabel}
            </span>
            <span className="truncate text-sm font-medium">{note.title}</span>
          </div>
          <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{fmtTime(note.createdAt)}</span>
        </div>

        {note.rawText !== note.title && (
          <p className="text-xs text-[var(--color-muted-foreground)]">{note.rawText}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
          {note.dueTime && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {note.dueTime}
            </span>
          )}
          {note.amount != null && (
            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <Wallet className="h-3.5 w-3.5" /> ¥{note.amount}
            </span>
          )}
          {note.tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              {note.tags.join(' · ')}
            </span>
          )}
          <span className="opacity-70">置信度 {(note.confidence * 100).toFixed(0)}%</span>
          {note.needsReview && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> 待复核
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function CapturePage() {
  const [text, setText] = useState('')
  const [notes, setNotes] = useState<NoteView[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      setNotes(await listNotes())
    } catch (e) {
      setBanner({ kind: 'err', text: `加载失败：${(e as Error).message}` })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 3000)
    return () => clearTimeout(t)
  }, [banner])

  async function handleSubmit() {
    const t = text.trim()
    if (!t || submitting) return
    setSubmitting(true)
    try {
      const res = await captureNote(t)
      setNotes(prev => [...res.items, ...prev])
      setText('')
      setBanner(
        res.degraded
          ? { kind: 'warn', text: '结构化抽取失败，已降级存为「未分类」笔记（未丢失）' }
          : { kind: 'ok', text: `已记下 ${res.items.length} 条` }
      )
    } catch (e) {
      setBanner({ kind: 'err', text: `记录失败：${(e as Error).message}` })
    } finally {
      setSubmitting(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Ctrl/Cmd + Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-[var(--color-primary)]" />
          <h1 className="text-xl font-bold tracking-tight">AI 秘书</h1>
          <Badge variant="secondary">记录态</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          <Link to="/tools/ai-secretary/ask" className="inline-flex items-center gap-1.5 hover:text-[var(--color-foreground)]">
            <MessageSquareText className="h-3.5 w-3.5" /> 回忆问答
          </Link>
          <Link
            to="/tools/ai-secretary/architecture"
            className="inline-flex items-center gap-1.5 hover:text-[var(--color-foreground)]"
          >
            <Network className="h-3.5 w-3.5" /> 架构总览
          </Link>
        </div>
      </header>

      {/* 输入区 */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder="随手记点什么…（如：明天下午3点和王总开会；买牛奶鸡蛋；打车花了38块）"
            className="w-full resize-none rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-muted-foreground)]">Ctrl/⌘ + Enter 快速记录</span>
            <Button onClick={handleSubmit} disabled={submitting || !text.trim()}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              {submitting ? '整理中…' : '记一笔'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 提示条 */}
      {banner && (
        <div
          className={cn(
            'rounded-md px-3 py-2 text-sm',
            banner.kind === 'ok' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
            banner.kind === 'warn' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
            banner.kind === 'err' && 'bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]'
          )}
        >
          {banner.text}
        </div>
      )}

      {/* 时间轴 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">时间轴</h2>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> 刷新
          </Button>
        </div>

        {loading && notes.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
          </div>
        ) : notes.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            还没有记录，在上面随手记一笔试试。
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map(n => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
