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
  Mic,
  Paperclip,
  Type,
  Trash2,
  Database,
  DatabaseZap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatBytes } from '@/lib/utils'
import {
  captureNote,
  captureUpload,
  captureVoice,
  deleteNote,
  listNotes,
  ragStatus,
  reindexRag,
  type CaptureResponse,
  type NoteView,
  type RagStatus,
} from '../lib/api'
import { VoiceRecorder } from '../components/VoiceRecorder'
import { AttachmentPicker } from '../components/AttachmentPicker'
import { useConfirm } from '@/components/ui/confirm-dialog'

type ComposerMode = 'text' | 'voice' | 'file'

/** 类目 → 徽章配色（与架构页的类目体系一致） */
const CATEGORY_STYLE: Record<string, string> = {
  TODO: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  SCHEDULE: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  EXPENSE: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  IDEA: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  NOTE: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  CREDENTIAL: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  UNCATEGORIZED: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function NoteCard({ note, onDelete }: { note: NoteView; onDelete: (id: string) => void }) {
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
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-[var(--color-muted-foreground)]">{fmtTime(note.createdAt)}</span>
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              title="删除"
              className="text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-destructive)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
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
          {note.tags && note.tags.length > 0 && (
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
          {note.vectorIndexed === true && (
            <span
              title="已写入向量库，可被语义召回"
              className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
            >
              <Database className="h-3.5 w-3.5" /> 已入向量库
            </span>
          )}
          {note.vectorIndexed === false && (
            <span
              title="尚未写入向量库（双写漂移）——点上方「重建索引」可修复"
              className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
            >
              <Database className="h-3.5 w-3.5" /> 未入向量库
            </span>
          )}
        </div>

        {note.attachments && note.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {note.attachments.map(a => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded border bg-[var(--color-muted)]/40 px-1.5 py-0.5 text-xs text-[var(--color-muted-foreground)]"
              >
                <Paperclip className="h-3 w-3" /> {a.fileName}
                <span className="opacity-70">{formatBytes(a.sizeBytes)}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function CapturePage() {
  const [text, setText] = useState('')
  const [composer, setComposer] = useState<ComposerMode>('text')
  const [notes, setNotes] = useState<NoteView[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [rag, setRag] = useState<RagStatus | null>(null)
  const [reindexing, setReindexing] = useState(false)
  const confirm = useConfirm()

  async function refresh() {
    setLoading(true)
    try {
      setNotes(await listNotes())
      // 向量库状态非阻塞拉取，失败不影响时间轴
      ragStatus().then(setRag).catch(() => setRag(null))
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

  function applyResult(res: CaptureResponse, okMsg: string) {
    setNotes(prev => [...res.items, ...prev])
    setBanner(
      res.degraded
        ? { kind: 'warn', text: '结构化抽取失败，已降级存为「未分类」（未丢失）' }
        : { kind: 'ok', text: okMsg.replace('{n}', String(res.items.length)) }
    )
  }

  async function handleSubmit() {
    const t = text.trim()
    if (!t || submitting) return
    setSubmitting(true)
    try {
      applyResult(await captureNote(t), '已记下 {n} 条')
      setText('')
    } catch (e) {
      setBanner({ kind: 'err', text: `记录失败：${(e as Error).message}` })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVoice(blob: Blob) {
    setSubmitting(true)
    try {
      applyResult(await captureVoice(blob), '语音已转写并记下 {n} 条')
    } catch (e) {
      setBanner({ kind: 'err', text: `语音失败：${(e as Error).message}` })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFiles(files: File[]) {
    setSubmitting(true)
    try {
      applyResult(await captureUpload('', files), '附件已上传，记下 {n} 条')
    } catch (e) {
      setBanner({ kind: 'err', text: `上传失败：${(e as Error).message}` })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: '删除记录',
      description: '确定删除这条记录？连带附件一并删除，不可恢复。',
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await deleteNote(id)
      setNotes(prev => prev.filter(n => n.id !== id))
      setBanner({ kind: 'ok', text: '已删除' })
    } catch (e) {
      setBanner({ kind: 'err', text: `删除失败：${(e as Error).message}` })
    }
  }

  async function handleReindex() {
    if (reindexing) return
    setReindexing(true)
    try {
      const r = await reindexRag()
      setRag(r)
      if (!r.enabled) {
        setBanner({ kind: 'warn', text: 'RAG 未启用：后端需带 rag.enabled=true 启动（run-supervised.ps1）' })
      } else if (r.error) {
        setBanner({ kind: 'err', text: `重建出错：${r.error}` })
      } else {
        setBanner({ kind: 'ok', text: `已重建 ${r.reindexed ?? 0} 条，向量库现有 ${r.points ?? 0} 点` })
      }
      setNotes(await listNotes()) // 刷新每条的入库标记
    } catch (e) {
      setBanner({ kind: 'err', text: `重建失败：${(e as Error).message}` })
    } finally {
      setReindexing(false)
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

      {/* 录入区：文字 / 语音 / 附件 */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex gap-1 rounded-md bg-[var(--color-muted)]/40 p-1 text-xs">
            {([
              ['text', '文字', Type],
              ['voice', '语音', Mic],
              ['file', '附件', Paperclip],
            ] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setComposer(k)}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 transition-colors',
                  composer === k
                    ? 'bg-[var(--color-background)] font-medium shadow-sm'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {composer === 'text' && (
            <>
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
            </>
          )}

          {composer === 'voice' && (
            <VoiceRecorder disabled={submitting} onSubmit={blob => handleVoice(blob)} />
          )}

          {composer === 'file' && (
            <AttachmentPicker disabled={submitting} onSubmitFiles={handleFiles} />
          )}
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
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">时间轴</h2>
            {rag && (
              <span
                title={rag.hint ?? rag.error ?? '向量库状态'}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                  !rag.enabled && 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                  rag.enabled && rag.usable && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                  rag.enabled && !rag.usable && 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                )}
              >
                <Database className="h-3 w-3" />
                {!rag.enabled ? 'RAG 未启用' : `向量库 ${rag.points ?? 0} 点`}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleReindex} disabled={reindexing || loading}>
              <DatabaseZap className={cn('h-3.5 w-3.5', reindexing && 'animate-pulse')} />
              {reindexing ? '重建中…' : '重建索引'}
            </Button>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> 刷新
            </Button>
          </div>
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
              <NoteCard key={n.id} note={n} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
