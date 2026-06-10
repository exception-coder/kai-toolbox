import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Send, Loader2, Wrench, MessageSquareText, NotebookPen, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { subscribeSsePost } from '@/lib/api'

interface Step {
  tool: string
  args: string
  result: string
}

export function RecallPage() {
  const [question, setQuestion] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [answer, setAnswer] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const stopRef = useRef<(() => void) | null>(null)

  function ask() {
    const q = question.trim()
    if (!q || running) return
    setSteps([])
    setAnswer('')
    setError('')
    setRunning(true)
    stopRef.current = subscribeSsePost(
      '/ai-secretary/ask',
      { question: q },
      {
        onEvent: (name, data) => {
          const d = data as Record<string, string>
          if (name === 'step') setSteps(prev => [...prev, d as unknown as Step])
          else if (name === 'answer') setAnswer(d?.text ?? '')
          else if (name === 'done' || name === 'completed') setRunning(false)
          else if (name === 'error') {
            setError(d?.message ?? '出错了')
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
            placeholder="用大白话问你记过的事…（如：上周吃饭花了多少？我有哪些待办？）"
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

      {/* Agent 调用过程（tool-loop 每一步） */}
      {steps.length > 0 && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-muted-foreground)]">
            <Wrench className="h-3.5 w-3.5" /> Agent 调用过程
          </h2>
          {steps.map((s, i) => (
            <Card key={i}>
              <CardContent className="flex items-start gap-2 p-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[10px] font-semibold text-[var(--color-primary)]">
                  {i + 1}
                </span>
                <div className="min-w-0 text-xs">
                  <div>
                    <span className="font-medium text-[var(--color-foreground)]">{s.tool}</span>
                    {s.args && <span className="text-[var(--color-muted-foreground)]">（{s.args}）</span>}
                  </div>
                  <div className="text-[var(--color-muted-foreground)]">→ {s.result}</div>
                </div>
              </CardContent>
            </Card>
          ))}
          {running && (
            <div className="flex items-center gap-2 px-1 text-xs text-[var(--color-muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 推理中…
            </div>
          )}
        </div>
      )}

      {/* 最终答案 */}
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
