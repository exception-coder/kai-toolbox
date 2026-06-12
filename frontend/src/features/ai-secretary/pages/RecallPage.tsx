import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Send, Loader2, Search, MessageSquareText, NotebookPen, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { subscribeSsePost } from '@/lib/api'

/** 一条召回命中：由后端代码确定性检索得到的真实库内记录（非模型转述）。 */
interface Hit {
  category: string
  categoryLabel: string
  text: string
  score: number | null
  source: string
  createdAt: number
}

export function RecallPage() {
  const [question, setQuestion] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [recalled, setRecalled] = useState(false)
  const [answer, setAnswer] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const stopRef = useRef<(() => void) | null>(null)

  function ask() {
    const q = question.trim()
    if (!q || running) return
    setHits([])
    setRecalled(false)
    setAnswer('')
    setError('')
    setRunning(true)
    stopRef.current = subscribeSsePost(
      '/ai-secretary/ask',
      { question: q },
      {
        onEvent: (name, data) => {
          if (name === 'recall') {
            const d = data as { hits?: Hit[] }
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
          <Bot className="h-6 w-6 text-[var(--color-primary)]" />
          <h1 className="text-xl font-bold tracking-tight">AI 秘书</h1>
          <Badge variant="secondary">回忆态</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          <Link to="/tools/ai-secretary" className="inline-flex items-center gap-1.5 hover:text-[var(--color-foreground)]">
            <NotebookPen className="h-3.5 w-3.5" /> 记录
          </Link>
          <Link
            to="/tools/ai-secretary/architecture"
            className="inline-flex items-center gap-1.5 hover:text-[var(--color-foreground)]"
          >
            <Network className="h-3.5 w-3.5" /> 架构
          </Link>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-2 p-4">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="用大白话问你记过的事…（如：我的 SVN 密码是什么？上周吃饭花了多少？）"
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

      {/* 召回明细：后端代码确定性检索到的「真实库内记录」，非模型转述 —— 看得见“据什么回答” */}
      {recalled && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-muted-foreground)]">
            <Search className="h-3.5 w-3.5" /> 召回明细
            <span className="font-normal">（代码检索 · 真实记录 · 共 {hits.length} 条）</span>
          </h2>
          {hits.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              未召回到任何记录——答案将直接告知“没有找到”。
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
                      <span className="text-[var(--color-muted-foreground)]">{h.source}</span>
                      <span className="text-[var(--color-muted-foreground)]">
                        {typeof h.score === 'number' ? `相似度 ${(h.score * 100).toFixed(0)}%` : '精确命中'}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-[var(--color-foreground)]">{h.text}</div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {running && (
            <div className="flex items-center gap-2 px-1 text-xs text-[var(--color-muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 据以上记录组织答案中…
            </div>
          )}
        </div>
      )}

      {/* 最终答案：模型仅据上面真实记录组织语言 */}
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
