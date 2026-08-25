import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardCheck, Clock, Copy, Loader2, X } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import { evaluateProgress, getProgressContent, getSession } from '../../api'
import type { DevDocEstimation } from '../../types'
import {
  ESTIMATION_CONFIDENCE_COLOR,
  ESTIMATION_CONFIDENCE_LABEL,
} from '../EstimationBadge'

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" aria-label="关闭" onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
      <X className="w-4 h-4" />
    </button>
  )
}

export function EstimationDetailSheet({
  estimation,
  onClose,
}: {
  estimation: DevDocEstimation
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="estimation-detail-title" className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span id="estimation-detail-title" className="font-semibold text-sm">AI 工时评估</span>
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {estimation.stale && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
              <span>⚠</span>
              <span>开发文档在这次评估之后又重新生成/更新过，工时可能已经不准，建议重新评估</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold text-[var(--color-foreground)]">
              {estimation.hoursMin}–{estimation.hoursMax} <span className="text-sm font-normal text-[var(--color-muted-foreground)]">小时</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border leading-tight ${ESTIMATION_CONFIDENCE_COLOR[estimation.confidence]}`}>
              信心：{ESTIMATION_CONFIDENCE_LABEL[estimation.confidence]}
            </span>
          </div>
          {estimation.reasoning && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5">评估依据</div>
              <p className="text-sm text-[var(--color-foreground)] leading-relaxed bg-[var(--color-muted)]/30 rounded-xl p-3">{estimation.reasoning}</p>
            </div>
          )}
          {estimation.breakdown.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-1.5">工时拆解（{estimation.breakdown.length} 项）</div>
              <div className="space-y-1.5">
                {estimation.breakdown.map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)]/60 text-sm">
                    <span className="text-[var(--color-foreground)]">{item.item}</span>
                    <span className="text-[var(--color-muted-foreground)] flex-shrink-0">{item.hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          评估于 {new Date(estimation.estimatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}，仅供参考，不代表实际排期承诺
        </div>
      </div>
    </div>
  )
}

export function EstimateEffortDialog({
  loading,
  error,
  onConfirm,
  onClose,
}: {
  loading: boolean
  error?: string | null
  onConfirm: (extraContext: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="estimate-effort-title" className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <h3 id="estimate-effort-title" className="font-semibold text-sm">AI 工时评估</h3>
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
            将基于当前核心规格和执行计划，结合代码知识图谱（依赖广度/既有复杂度）与业务知识图谱（相关业务规则）给出工时区间估算，仅供参考。
          </p>
          <div>
            <label htmlFor="estimate-extra-context" className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
              补充上下文（可选）—— 如团队人力、对该模块技术栈的熟悉程度
            </label>
            <textarea id="estimate-extra-context" value={text} onChange={(event) => setText(event.target.value)} rows={3} placeholder="如：只有 1 名开发，对该模块代码不熟悉；或：团队已多次开发类似功能，比较熟练" className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={loading} className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30 disabled:opacity-50">取消</button>
            <button type="button" onClick={() => onConfirm(text.trim())} disabled={loading} className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:opacity-90 disabled:opacity-60">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? '评估中…' : '开始评估'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function EvaluateProgressDialog({
  sessionId,
  onClose,
  onGenerated,
}: {
  sessionId: string
  onClose: () => void
  onGenerated: () => void
}) {
  const [step, setStep] = useState<'confirm' | 'generating' | 'done'>('confirm')
  const [extraContext, setExtraContext] = useState('')
  const [reportContent, setReportContent] = useState('')
  const [stage, setStage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const generatedRef = useRef(false)

  const loadCompletedReport = useCallback(async () => {
    const content = await getProgressContent(sessionId)
    setReportContent(content)
    setStep('done')
    if (!generatedRef.current) {
      generatedRef.current = true
      onGenerated()
    }
  }, [onGenerated, sessionId])

  const applyWorkState = useCallback(async (session: Awaited<ReturnType<typeof getSession>>, recovering = false) => {
    if (session.progressWorkStatus === 'RUNNING') {
      setStage(session.progressWorkStage || '正在恢复后台分析进度')
      setStep('generating')
      return
    }
    if (session.progressWorkStatus === 'ERROR') {
      setError(session.progressWorkError || '本地代码分析失败，可重新发起')
      setStep('confirm')
      return
    }
    if (!recovering && session.progressWorkStatus === 'COMPLETED') {
      await loadCompletedReport()
    }
  }, [loadCompletedReport])

  useEffect(() => {
    let cancelled = false
    void getSession(sessionId).then(session => {
      if (!cancelled) void applyWorkState(session, true)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [applyWorkState, sessionId])

  useEffect(() => {
    if (step !== 'generating') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const session = await getSession(sessionId)
        if (cancelled) return
        await applyWorkState(session)
        if (session.progressWorkStatus === 'RUNNING') timer = setTimeout(poll, 2_000)
      } catch (cause) {
        if (!cancelled) timer = setTimeout(poll, 3_000)
      }
    }
    timer = setTimeout(poll, 1_000)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [applyWorkState, sessionId, step])

  const handleStart = async () => {
    setError(null)
    generatedRef.current = false
    setStage('正在提交后台分析任务')
    setStep('generating')
    try {
      const session = await evaluateProgress(sessionId, extraContext.trim() || undefined)
      await applyWorkState(session)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '后台分析任务启动失败，请重试')
      setStep('confirm')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="evaluate-progress-title" className={`w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl flex flex-col ${step === 'done' ? 'max-w-3xl h-[85vh]' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-blue-400" />
            <span id="evaluate-progress-title" className="font-semibold text-sm">{step === 'confirm' ? 'AI 进度评估' : step === 'generating' ? '正在核对进度…' : '进度评估报告'}</span>
          </div>
          <CloseButton onClose={onClose} />
        </div>
        {step === 'confirm' && (
          <div className="p-5 space-y-3">
            <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">将基于当前核心规格和执行计划，结合代码知识图谱核对代码库里实际能查到的实现，生成固定大纲的进度报告。每次评估按版本追加保存，不会覆盖之前的评估记录。</p>
            <div>
              <label htmlFor="progress-extra-context" className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">补充核对重点（可选）</label>
              <textarea id="progress-extra-context" value={extraContext} onChange={(event) => setExtraContext(event.target.value)} rows={3} placeholder="如：重点核对库存流水是否已写入、重点核对重复扫码幂等控制" className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]" />
            </div>
            {error && <p className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30">取消</button>
              <button type="button" onClick={handleStart} className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:opacity-90">开始评估</button>
            </div>
          </div>
        )}
        {step === 'generating' && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center gap-2 text-sm text-[var(--color-foreground)]"><Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" /><span>{stage || '后台正在核查本地代码'}</span></div>
            <p className="mt-3 text-xs leading-5 text-[var(--color-muted-foreground)]">任务由服务端持续执行。现在可以关闭弹窗、刷新页面或离开当前模块，重新进入后会自动恢复进度。</p>
          </div>
        )}
        {step === 'done' && (
          <>
            <div className="flex-1 overflow-hidden"><MarkdownContent content={reportContent} /></div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)] flex-shrink-0">
              <button type="button" onClick={() => navigator.clipboard.writeText(reportContent)} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"><Copy className="w-3 h-3" /> 复制</button>
              <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-md text-sm bg-[var(--color-primary)] text-white hover:opacity-90">完成</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
