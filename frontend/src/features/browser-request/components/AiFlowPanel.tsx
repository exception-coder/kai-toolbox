import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Loader2, Play, Save, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { aiFlows } from '../api'
import type { FlowAction, FlowRunResult } from '../types'

interface Props {
  sessionId: string
}

/**
 * AI 用例面板：自然语言 → LLM 生成动作脚本 → 确定性执行 + 断言验证 → 人工确认落库。
 *
 * 编排刻意「人在环」：生成/执行/确认分三步，失败时由用户决定是否「让 AI 看现场修正」。
 * 这样 LLM 只在编写/重写出现，执行与确认是确定性、可复现的。
 */
export function AiFlowPanel({ sessionId }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const FLOWS_KEY = ['browser-request', 'ai-flows', sessionId] as const

  const [instruction, setInstruction] = useState('')
  const [steps, setSteps] = useState<FlowAction[] | null>(null)
  const [raw, setRaw] = useState('')
  const [result, setResult] = useState<FlowRunResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const { data: saved = [] } = useQuery({ queryKey: FLOWS_KEY, queryFn: () => aiFlows.list(sessionId) })

  const genMut = useMutation({
    mutationFn: (healing: boolean) =>
      aiFlows.generate(sessionId, {
        instruction,
        previousSteps: healing ? steps : null,
        failureError: healing ? (result?.results.find(r => !r.ok)?.error ?? null) : null,
        failedAt: healing ? (result?.failedAt ?? null) : null,
      }),
    onSuccess: r => { setSteps(r.steps); setRaw(r.rawOutput); setResult(null) },
  })

  const runMut = useMutation({
    mutationFn: () => aiFlows.run(sessionId, steps ?? []),
    onSuccess: r => setResult(r),
  })

  const saveMut = useMutation({
    mutationFn: (name: string) => aiFlows.save(sessionId, { name, instruction, steps: steps ?? [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FLOWS_KEY })
      setSteps(null); setRaw(''); setResult(null); setInstruction('')
    },
  })

  const runSavedMut = useMutation({
    mutationFn: (flowId: string) => aiFlows.runSaved(flowId),
    onSuccess: r => setResult(r),
  })

  const deleteMut = useMutation({
    mutationFn: (flowId: string) => aiFlows.delete(flowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: FLOWS_KEY }),
  })

  const onSave = async () => {
    const name = window.prompt('给这个用例起个名字', instruction.slice(0, 20) || '未命名用例')
    if (name != null) saveMut.mutate(name.trim() || '未命名用例')
  }

  const genErr = genMut.error instanceof Error ? genMut.error.message : null
  const runErr = runMut.error instanceof Error ? runMut.error.message : null
  const canConfirm = result?.ok === true

  return (
    <div className="space-y-3">
      {/* 1. 自然语言输入 + 生成 */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4" /> AI 用例
            <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
              用大白话描述要做的操作，AI 写脚本 → 执行验证 → 确认保存
            </span>
          </div>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            rows={3}
            placeholder="例：在搜索框输入「Java」，点搜索，等结果列表出来，点开第一个岗位"
            className="w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!instruction.trim() || genMut.isPending}
              onClick={() => genMut.mutate(false)}
            >
              {genMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              生成脚本
            </Button>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              生成前请确保会话已「打开」（AI 会读当前页面挑选择器）
            </span>
          </div>
          {genErr && <div className="text-xs text-red-600 dark:text-red-400">生成失败：{genErr}</div>}
        </CardContent>
      </Card>

      {/* 2. 生成的脚本 + 执行 + 确认 */}
      {steps && (
        <Card>
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">生成的脚本（{steps.length} 步）</div>
              <button
                className="text-xs text-[var(--color-muted-foreground)] underline"
                onClick={() => setShowRaw(v => !v)}
              >
                {showRaw ? '收起原始输出' : '看 LLM 原始输出'}
              </button>
            </div>
            <ol className="space-y-1">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 rounded bg-[var(--color-muted)] p-1.5 text-xs">
                  <span className="shrink-0 font-mono text-[var(--color-muted-foreground)]">{i + 1}.</span>
                  <StepLine s={s} outcome={result?.results.find(r => r.index === i)} />
                </li>
              ))}
            </ol>
            {showRaw && (
              <pre className="max-h-40 overflow-auto rounded border bg-black/5 p-2 text-[10px]">{raw}</pre>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={runMut.isPending} onClick={() => runMut.mutate()}>
                {runMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                执行验证
              </Button>
              {result && !result.ok && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={genMut.isPending}
                  onClick={() => genMut.mutate(true)}
                  title="把失败现场（当前页面 DOM + 失败原因）喂给 AI 重写脚本"
                >
                  {genMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  让 AI 看现场修正
                </Button>
              )}
              <Button size="sm" disabled={!canConfirm || saveMut.isPending} onClick={onSave}>
                <Save className="size-4" /> 确认保存为用例
              </Button>
            </div>

            {runErr && <div className="text-xs text-red-600 dark:text-red-400">执行出错：{runErr}</div>}
            {result && (
              <div className={`text-xs ${result.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {result.ok
                  ? '✓ 全部步骤通过，可确认保存'
                  : `✗ 第 ${result.failedAt + 1} 步失败：${result.results.find(r => !r.ok)?.error ?? ''}`}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. 已保存用例 */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="text-sm font-medium">已保存用例（{saved.length}）</div>
          {saved.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
              还没有保存的用例。上面生成并验证通过后点「确认保存」。
            </div>
          )}
          <ul className="space-y-1">
            {saved.map(f => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.name}</div>
                  <div className="truncate text-[10px] text-[var(--color-muted-foreground)]">
                    {f.steps.length} 步 · {f.instruction}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={runSavedMut.isPending}
                  onClick={() => runSavedMut.mutate(f.id)}
                  title="运行该用例"
                >
                  <Play className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '删除用例',
                      description: `「${f.name}」将被删除，不可恢复。`,
                      variant: 'destructive',
                      confirmText: '删除',
                    })
                    if (ok) deleteMut.mutate(f.id)
                  }}
                  title="删除"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function StepLine({ s, outcome }: { s: FlowAction; outcome?: { ok: boolean; error?: string | null } }) {
  const mark = outcome ? (outcome.ok ? '✓' : '✗') : ''
  const markColor = outcome ? (outcome.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : ''
  return (
    <span className="min-w-0 flex-1">
      <span className={`mr-1 font-mono ${markColor}`}>{mark}</span>
      <span className="font-mono font-medium">{s.type}</span>
      <span className="font-mono text-[var(--color-muted-foreground)]">{describe(s)}</span>
    </span>
  )
}

function describe(s: FlowAction): string {
  switch (s.type) {
    case 'navigate': return ` → ${s.url}`
    case 'fill': return ` ${s.selector} = "${s.text}"`
    case 'click': return ` ${s.selector}`
    case 'press': return ` ${s.key}${s.selector ? ` @ ${s.selector}` : ''}`
    case 'scroll': return s.selector ? ` → ${s.selector}` : ` dy=${s.dy}`
    case 'waitFor': return ` ${s.selector}`
    case 'assert': return ` ${s.assertType}(${s.assertType === 'selectorVisible' ? s.selector : s.value})`
    default: return ''
  }
}
