import { useState } from 'react'
import { Check, CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useReplayStream } from '../hooks/useReplayStream'
import type { StepResultView } from '../types'

interface Props {
  runId: string
  /** runId 改变后清理回调 */
  onClose: () => void
}

/**
 * 实时展示回放进度的面板。每个 step 一行，绿√/红×/转圈。
 */
export function ReplayProgressPanel({ runId, onClose }: Props) {
  const state = useReplayStream(runId)

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="text-sm font-medium">回放进度</div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {state.status === 'RUNNING' && '执行中…'}
              {state.status === 'DONE' && '已完成'}
              {state.status === 'FAILED' && '已失败'}
              {state.status === 'CANCELLED' && '已取消'}
              {state.stepCount > 0 && ` · 共 ${state.stepCount} step`}
            </div>
          </div>
          {state.status === 'RUNNING' && <Loader2 className="size-4 animate-spin text-[var(--color-primary)]" />}
          {state.status === 'DONE' && <CheckCircle2 className="size-5 text-green-600" />}
          {state.status === 'FAILED' && <XCircle className="size-5 text-red-600" />}
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            ×
          </button>
        </div>

        {state.errorMessage && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
            {state.errorMessage}
          </div>
        )}

        {state.outputDir && (
          <div className="flex items-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-700 dark:text-green-300">
            <span className="shrink-0">
              {state.status === 'RUNNING' ? '正在归档到：' : '输出已归档到：'}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-[10px]" title={state.outputDir}>
              {state.outputDir}
            </code>
            <CopyResponseButton text={state.outputDir} />
          </div>
        )}

        <ul className="space-y-1">
          {Array.from({ length: state.stepCount || state.stepResults.length }).map((_, i) => {
            const rs = state.stepResults.filter(rr => rr.stepIndex === i)
            // 三档：未跑 / 单条（非迭代） / 多条（fan-out 迭代）
            if (rs.length === 0) {
              return (
                <li key={i} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-right text-[10px] text-[var(--color-muted-foreground)]">
                      #{i + 1}
                    </span>
                    {state.status === 'RUNNING' && (
                      <Loader2 className="size-3 animate-spin text-[var(--color-muted-foreground)]" />
                    )}
                    <span className="text-[var(--color-muted-foreground)]">...</span>
                  </div>
                </li>
              )
            }
            const isIterated = rs.length > 1 || (rs[0].iterationTotal != null && rs[0].iterationTotal > 0)
            if (!isIterated) {
              return (
                <li key={i} className="rounded-md border text-xs">
                  <StepRow result={rs[0]} indexLabel={`#${i + 1}`} />
                </li>
              )
            }
            // 迭代：父行展示聚合 + 子行各 iteration
            const okCount = rs.filter(r => r.error == null).length
            const failCount = rs.length - okCount
            const totalElapsed = rs.reduce((s, r) => s + (r.elapsedMs ?? 0), 0)
            return (
              <li key={i} className="rounded-md border text-xs">
                <details open>
                  <summary className="flex cursor-pointer items-center gap-2 p-2">
                    <span className="w-8 text-right text-[10px] text-[var(--color-muted-foreground)]">
                      #{i + 1}
                    </span>
                    {failCount === 0 && state.status !== 'RUNNING'
                      ? <CheckCircle2 className="size-3 text-green-600" />
                      : failCount > 0
                        ? <XCircle className="size-3 text-red-600" />
                        : <Loader2 className="size-3 animate-spin text-[var(--color-muted-foreground)]" />}
                    <span className="min-w-0 flex-1 truncate">{rs[0].stepName}</span>
                    <Badge variant="secondary" title={`已完成 ${rs.length} 次迭代${rs[0].iterationTotal != null ? '，共 ' + rs[0].iterationTotal : ''}`}>
                      迭代 {rs.length}{rs[0].iterationTotal != null ? `/${rs[0].iterationTotal}` : ''}
                    </Badge>
                    {failCount > 0 && (
                      <Badge variant="destructive">{failCount} 失败</Badge>
                    )}
                    <span className="text-[10px] text-[var(--color-muted-foreground)]">
                      ∑ {totalElapsed}ms
                    </span>
                  </summary>
                  <ul className="space-y-0.5 border-t bg-[var(--color-muted)]/30 p-1">
                    {rs.map(r => (
                      <li key={r.iterationIndex ?? 0} className="rounded border bg-[var(--color-card)] text-[11px]">
                        <StepRow
                          result={r}
                          indexLabel={`[${(r.iterationIndex ?? 0) + 1}/${r.iterationTotal ?? rs.length}]`}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )
          })}
        </ul>

        {state.stepResults.some(r => Object.keys(r.extracted).length > 0) && (
          <details>
            <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
              抽取的变量
            </summary>
            <pre className="overflow-auto rounded bg-[var(--color-muted)] p-2 font-mono text-[10px]">
              {JSON.stringify(
                Object.assign({}, ...state.stepResults.map(r => r.extracted)),
                null, 2,
              )}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

/**
 * 单条 step / iteration 结果的统一渲染。
 * - 顶部一行：序号 / 状态图标 / step 名 / status code / elapsed / error 摘要
 * - 中部：响应预览（折叠）+ 抽取摘要
 * 父用 <li>，自身渲染不带 li，方便嵌在「迭代父行」的 ul 下做嵌套。
 */
function StepRow({ result, indexLabel }: { result: StepResultView; indexLabel: string }) {
  const r = result
  return (
    <>
      <div className="flex items-center gap-2 p-2">
        <span className="w-10 text-right text-[10px] text-[var(--color-muted-foreground)]">
          {indexLabel}
        </span>
        {r.error == null
          ? <CheckCircle2 className="size-3 text-green-600" />
          : <XCircle className="size-3 text-red-600" />}
        <span className="min-w-0 flex-1 truncate" title={r.finalUrl ?? ''}>
          {r.stepName}
        </span>
        {r.status != null && (
          <Badge variant={r.status >= 200 && r.status < 300 ? 'default' : 'destructive'}>
            {r.status}
          </Badge>
        )}
        {r.elapsedMs != null && (
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            {r.elapsedMs}ms
          </span>
        )}
        {r.error && (
          <span className="text-[10px] text-red-600" title={r.error}>
            {truncate(r.error, 60)}
          </span>
        )}
      </div>
      {r.responseSample && (
        <details className="border-t">
          <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[10px] text-[var(--color-muted-foreground)]">
            <span>响应预览（{r.responseSample.length} 字符{r.responseSample.endsWith('…') ? '，已截断' : ''}）</span>
            <CopyResponseButton text={r.responseSample} />
            {r.finalUrl && (
              <span className="ml-auto min-w-0 truncate font-mono" title={r.finalUrl}>
                {r.finalUrl}
              </span>
            )}
          </summary>
          <pre className="max-h-60 overflow-auto rounded-b bg-[var(--color-muted)] p-2 font-mono text-[10px]">
            {r.responseSample}
          </pre>
        </details>
      )}
      {Object.keys(r.extracted).length > 0 && (
        <div className="border-t bg-[var(--color-muted)]/40 px-2 py-1 text-[10px]">
          <span className="text-[var(--color-muted-foreground)]">本次抽取：</span>
          {Object.entries(r.extracted).map(([k, v]) => (
            <span key={k} className="ml-2 font-mono">
              <span className="text-[var(--color-primary)]">${`{${k}}`}</span>
              {' = '}
              <span title={v}>{truncate(v, 40)}</span>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

/** 响应预览旁的一键复制按钮，点击不冒泡到 <summary>，避免误折叠。 */
function CopyResponseButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async e => {
        e.preventDefault()
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch { /* 用户拒绝剪贴板权限时静默失败 */ }
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
      title="复制响应预览到剪贴板"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}
