import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, Send, Loader2, Search, MessageSquareText, Database, DatabaseZap, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { subscribeSsePost } from '@/lib/api'
import { java8guRagStatus, java8guReindex, type Java8guHit, type Java8guRagStatus } from '../lib/ragApi'

export function Java8guAskPage() {
  const [question, setQuestion] = useState('')
  const [hits, setHits] = useState<Java8guHit[]>([])
  const [recalled, setRecalled] = useState(false)
  const [answer, setAnswer] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [rag, setRag] = useState<Java8guRagStatus | null>(null)
  const [reindexing, setReindexing] = useState(false)
  const [banner, setBanner] = useState('')
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    java8guRagStatus().then(setRag).catch(() => setRag(null))
  }, [])

  function ask() {
    const q = question.trim()
    if (!q || running) return
    setHits([])
    setRecalled(false)
    setAnswer('')
    setError('')
    setRunning(true)
    stopRef.current = subscribeSsePost(
      '/java8gu/ask',
      { question: q },
      {
        onEvent: (name, data) => {
          if (name === 'recall') {
            const d = data as { hits?: Java8guHit[] }
            setHits(Array.isArray(d?.hits) ? d.hits : [])
            setRecalled(true)
          } else if (name === 'answer') {
            setAnswer((data as { text?: string })?.text ?? '')
          } else if (name === 'done' || name === 'completed') {
            setRunning(false)
          } else if (name === 'error') {
            setError((data as { message?: string })?.message ?? '出错了')
            setRunning(false)
          }
        },
        onError: e => {
          setError((e as Error)?.message ?? String(e))
          setRunning(false)
        },
        onClose: () => setRunning(false),
      }
    )
  }

  async function reindex() {
    if (reindexing) return
    setReindexing(true)
    setBanner('')
    try {
      const r = await java8guReindex()
      setRag(r)
      if (!r.enabled) setBanner('RAG 未启用：后端需带 -Dtoolbox.java8gu.rag.enabled=true 启动')
      else if (r.error) setBanner(`重建出错：${r.error}`)
      else setBanner(`已入库 ${r.indexed ?? 0} 条，向量库现有 ${r.points ?? 0} 点`)
    } catch (e) {
      setBanner(`重建失败：${(e as Error).message}`)
    } finally {
      setReindexing(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      ask()
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-[var(--color-primary)]" />
          <h1 className="text-xl font-bold tracking-tight">Java 八股秘书</h1>
          <Badge variant="secondary">复习问答</Badge>
        </div>
        <Link
          to="/tools/java8gu"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 卡片回顾
        </Link>
      </header>

      {/* RAG 状态 + 首次入库 */}
      <div className="flex items-center justify-between gap-2 text-xs">
        {rag && (
          <span
            title={rag.hint ?? rag.error ?? '向量库状态'}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
              !rag.enabled && 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
              rag.enabled && rag.usable && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
              rag.enabled && !rag.usable && 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            )}
          >
            <Database className="h-3 w-3" />
            {!rag.enabled ? 'RAG 未启用' : `向量库 ${rag.points ?? 0} 点`}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={reindex} disabled={reindexing}>
          <DatabaseZap className={cn('h-3.5 w-3.5', reindexing && 'animate-pulse')} />
          {reindexing ? '入库中…' : '重建索引'}
        </Button>
      </div>
      {banner && (
        <div className="rounded-md bg-[var(--color-muted)]/50 px-3 py-2 text-xs text-[var(--color-foreground)]">{banner}</div>
      )}

      <Card>
        <CardContent className="space-y-2 p-4">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="问点八股…（如：synchronized 和 ReentrantLock 区别？G1 为什么分 Region？）"
            className="w-full resize-none rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-muted-foreground)]">Ctrl/⌘ + Enter 提问</span>
            <Button onClick={ask} disabled={running || !question.trim()}>
              {running ? <Loader2 className="animate-spin" /> : <Send />}
              {running ? '思考中…' : '提问'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-[var(--color-destructive)]/15 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {/* 召回明细：代码检索到的真实卡片 */}
      {recalled && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-muted-foreground)]">
            <Search className="h-3.5 w-3.5" /> 召回卡片
            <span className="font-normal">（代码检索 · 真实题库 · 共 {hits.length} 张）</span>
          </h2>
          {hits.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              未召回到卡片——答案将直接告知"无相关卡片"。
            </div>
          ) : (
            hits.map((h, i) => (
              <Card key={i}>
                <CardContent className="flex items-start gap-2 p-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[10px] font-semibold text-[var(--color-primary)]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{h.categoryLabel}</Badge>
                      <Link to={`/tools/java8gu/q/${h.id}`} className="font-medium text-[var(--color-foreground)] hover:underline">
                        {h.title}
                      </Link>
                      <span className="text-[var(--color-muted-foreground)]">相似度 {(h.score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-[var(--color-muted-foreground)]">{h.snippet}</div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {running && (
            <div className="flex items-center gap-2 px-1 text-xs text-[var(--color-muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 据以上卡片组织复习作答中…
            </div>
          )}
        </div>
      )}

      {/* 作答 */}
      {answer && (
        <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
          <CardContent className="flex items-start gap-2 p-4">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <div className="whitespace-pre-wrap text-sm">{answer}</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
