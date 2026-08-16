import { useEffect, useRef, useState } from 'react'
import { Clock, GitBranch, Loader2, Sparkles, X } from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import type { ClarifyEngine } from '../dialogs/StartClarifyDialog'

export function GeneratingPanel({
  streamText,
  failed,
  onRetry,
  engine,
}: {
  streamText: string
  failed: boolean
  onRetry: () => void
  engine?: 'claude' | 'codex'
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const agentName = engine === 'codex' ? 'Codex' : 'Claude'
  const receiving = streamText.length > 0

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [streamText])
  useEffect(() => {
    if (failed) return
    const startedAt = Date.now()
    setElapsedMs(0)
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => window.clearInterval(timer)
  }, [failed])

  if (failed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <X className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <p className="font-medium text-[var(--color-foreground)] mb-1">PRD 生成未能完成</p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            可能是 Claude Agent 超时（复杂需求通常需要 60-120 秒）。<br />
            问答历史已保存，点击重试即可直接重新生成。
          </p>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90"
        >
          <Loader2 className="w-4 h-4" />
          重新生成 PRD
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-hidden">
      <div className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/12">
              <Loader2 className="size-4 animate-spin text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                {receiving ? `${agentName} 正在持续生成 PRD` : `正在等待 ${agentName} 返回首段内容`}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">
                {receiving
                  ? `已接收 ${streamText.length.toLocaleString('zh-CN')} 个字符，内容会继续实时追加。`
                  : elapsedMs < 20_000
                    ? '正在整理原始需求、澄清问答和附件，准备生成上下文。'
                    : elapsedMs < 60_000
                      ? '模型正在分析需求并组织文档结构，首段内容尚未返回。'
                      : '复杂需求或包含图片时首段响应会更慢，任务仍在服务端执行，请保持页面打开。'}
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/80 px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
            <Clock className="size-3.5" />
            已等待 {formatDuration(elapsedMs)}
          </div>
        </div>

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div className="h-full w-full origin-left animate-pulse rounded-full bg-[var(--color-primary)]" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
          {[
            { label: '任务已提交', state: 'done' },
            { label: '等待首段响应', state: receiving ? 'done' : 'active' },
            { label: '接收 PRD 内容', state: receiving ? 'active' : 'pending' },
            { label: '保存并进入编辑', state: 'pending' },
          ].map((item, index) => (
            <div
              key={item.label}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-2 ${
                item.state === 'active'
                  ? 'bg-[var(--color-primary)]/12 font-medium text-[var(--color-primary)]'
                  : item.state === 'done'
                    ? 'text-[var(--color-foreground)]'
                    : 'text-[var(--color-muted-foreground)] opacity-60'
              }`}
            >
              <span className={`flex size-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] ${
                item.state === 'done'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : item.state === 'active'
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
              }`}>
                {item.state === 'done' ? '✓' : index + 1}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-4 text-sm whitespace-pre-wrap break-words leading-relaxed">
        {streamText || (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-[var(--color-muted-foreground)]">
            <Sparkles className="size-6 animate-pulse text-[var(--color-primary)]" />
            <p className="text-sm">PRD 内容将在模型返回后实时显示在这里</p>
            <p className="text-xs">通常需要 60–120 秒，复杂需求可能更久</p>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ───── 修订会话准备面板（点击开始修订后立即展示） ─────
export function RevisionPreparingPanel({
  engine,
  stage,
}: {
  engine: ClarifyEngine
  stage: 'reading' | 'creating'
}) {
  const engineName = engine === 'codex' ? 'Codex' : 'Claude Code'
  const stages = [
    { key: 'reading', label: '读取原 PRD 内容与版本上下文' },
    { key: 'creating', label: '创建修订会话并保存所选引擎' },
    { key: 'clarifying', label: '进入 AI 澄清并生成首个问题' },
  ] as const
  const activeIndex = stage === 'reading' ? 0 : 1

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <span className="text-xs text-[var(--color-muted-foreground)]">正在启动修订澄清</span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
            style={{ width: stage === 'reading' ? '25%' : '65%' }}
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          {engineName} 准备中…
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
            <GitBranch className="w-4 h-4 text-[var(--color-primary)]" />
          </div>
          <div className="flex-1 max-w-2xl rounded-2xl rounded-tl-sm bg-[var(--color-muted)]/30 border border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-[var(--color-foreground)] mb-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
              <span>修订请求已提交，正在准备澄清环境…</span>
            </div>
            <div className="space-y-2 text-xs">
              {stages.map((item, index) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-2 ${
                    index <= activeIndex
                      ? 'text-[var(--color-foreground)]'
                      : 'text-[var(--color-muted-foreground)] opacity-60'
                  }`}
                >
                  {index < activeIndex ? (
                    <span className="flex size-4 items-center justify-center rounded-full bg-green-500/15 text-[10px] text-green-500">✓</span>
                  ) : index === activeIndex ? (
                    <Loader2 className="size-4 animate-spin text-[var(--color-primary)]" />
                  ) : (
                    <span className="size-4 rounded-full border border-[var(--color-border)]" />
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[var(--color-muted-foreground)]">
              页面已进入修订流程，请勿重复点击；准备完成后会自动显示第一个澄清问题。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───── 多轮渐进澄清对话面板（Step CHATTING） ─────
