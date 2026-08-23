import { useEffect, useRef, useState } from 'react'
import { Clock, Loader2, Sparkles, X } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import { formatDuration } from '@/lib/utils'

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
  const contentRef = useRef<HTMLDivElement>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const agentName = engine === 'codex' ? 'Codex' : 'Claude'
  const receiving = streamText.length > 0

  useEffect(() => {
    const container = contentRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [streamText])
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
          <p className="font-medium text-[var(--color-foreground)] mb-1">核心规格生成未能完成</p>
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
          重新生成核心规格
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
                {receiving ? `${agentName} 正在持续生成核心规格` : `正在等待 ${agentName} 返回首段内容`}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">
                {receiving
                  ? `已接收 ${streamText.length.toLocaleString('zh-CN')} 个字符，内容会继续实时追加。`
                  : elapsedMs < 20_000
                    ? '正在整理原始需求、初始化规格和附件，准备生成上下文。'
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
            { label: '接收核心规格内容', state: receiving ? 'active' : 'pending' },
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

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20">
        {streamText ? (
          <MarkdownContent content={streamText} containerRef={contentRef} className="p-4 text-sm" />
        ) : (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-[var(--color-muted-foreground)]">
            <Sparkles className="size-6 animate-pulse text-[var(--color-primary)]" />
            <p className="text-sm">核心规格将在模型返回后实时显示在这里</p>
            <p className="text-xs">通常需要 60–120 秒，复杂需求可能更久</p>
          </div>
        )}
      </div>
    </div>
  )
}
