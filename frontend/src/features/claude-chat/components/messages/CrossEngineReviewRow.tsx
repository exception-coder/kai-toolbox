import { ChevronDown, ShieldCheck } from 'lucide-react'
import type { CrossEngineReview } from '../../lib/crossEngineReview'
import { fmtMs } from '../../lib/metrics'

const engines: Record<string, string> = {
  deepseek: 'DeepSeek Harness', codex: 'Codex', claude: 'Claude Code',
  qwen: 'Qwen Code', gemini: 'Gemini CLI', opencode: 'OpenCode',
}

const reasons: Record<string, string> = {
  HARNESS_UNAUTHORIZED: '评审引擎缺少可用凭据。',
  HARNESS_NOT_INSTALLED: '评审引擎尚未安装。',
  HARNESS_INCOMPATIBLE: '评审引擎版本或运行模式不兼容。',
  SECURITY_POLICY_BLOCKED: '项目策略阻止了此次审查。',
  EXECUTION_TIMEOUT: '在限定时间内没有收到评审结果。',
  INVALID_REVIEW_RESULT: '引擎返回的结果无法确认。',
}

function status(review: CrossEngineReview) {
  switch (review.state) {
    case 'REQUESTED': return '准备中'
    case 'RUNNING': return '审查中'
    case 'SKIPPED': return '已跳过 · 未调用'
    case 'TIMEOUT': return '已超时'
    case 'ERROR': return '执行失败'
    case 'UNKNOWN': return '结果未确认'
    case 'COMPLETED':
      if (review.reviewStatus === 'INCONCLUSIVE') return '已完成 · 无法下结论'
      if (review.findingCount) return `已完成 · 发现 ${review.findingCount} 项`
      return review.reviewStatus === 'PASS' ? '已完成 · 未发现问题' : '已完成'
  }
}

export function CrossEngineReviewRow({ review }: { review: CrossEngineReview }) {
  const engine = review.engine ? engines[review.engine] ?? review.engine : undefined
  const reason = review.reasonCode ? reasons[review.reasonCode] : undefined
  return <details className="group/review min-w-0 rounded-md border border-[var(--color-border)] text-sm">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
      <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-medium">独立代码审查</span>
        {engine && <span className="min-w-0 wrap-anywhere text-xs text-[var(--color-muted-foreground)]">
          {engine}{review.model && ` · ${review.model}`}
        </span>}
        <span role="status" className="text-xs text-[var(--color-muted-foreground)]">{status(review)}</span>
      </span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open/review:rotate-180" />
    </summary>
    <div className="space-y-1 border-t px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
      {review.durationMs !== undefined && <p>审查耗时 · {fmtMs(review.durationMs)}</p>}
      {reason ? <p>{reason}</p> : review.state === 'UNKNOWN' ? <p>当前记录没有收到该审查的最终结果。</p>
        : <p>独立评审引擎只读检查本次任务。</p>}
    </div>
  </details>
}
