import { AlertTriangle, CheckCircle2, RefreshCw, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import type { ForgeEnvironmentSnapshot } from '../types'

const SUMMARY: Record<ForgeEnvironmentSnapshot['state'], { title: string; description: string; tone: StatusTone }> = {
  READY: {
    title: 'Forge 研发环境已就绪',
    description: '基础工具、研发方法和公司套件均可正常使用。',
    tone: 'success',
  },
  ATTENTION: {
    title: '核心能力可用，仍有建议项',
    description: '阻断项已经清零；下方关注项不影响当前使用，可按团队环境策略择期处理。',
    tone: 'warning',
  },
  BLOCKED: {
    title: '环境尚未完整就绪',
    description: '先补齐阻断项，再继续安装公司套件和知识能力。',
    tone: 'danger',
  },
}

export function ReadinessSummary({
  snapshot,
  refreshing,
  initializing,
  busy = initializing,
  onRefresh,
  onInitialize,
}: {
  snapshot: ForgeEnvironmentSnapshot
  refreshing: boolean
  initializing: boolean
  busy?: boolean
  onRefresh: () => void
  onInitialize: () => void
}) {
  const content = SUMMARY[snapshot.state]
  const StateIcon = snapshot.ready ? CheckCircle2 : AlertTriangle

  return (
    <section className="border-b border-[var(--color-border)] pb-8" aria-labelledby="forge-readiness-title">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2">
            <StatusBadge tone={content.tone}>{snapshot.state === 'READY' ? '全部就绪' : snapshot.state === 'ATTENTION' ? '需关注' : `${snapshot.blockingCount} 项阻断`}</StatusBadge>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              最近检测 {new Date(snapshot.checkedAt).toLocaleString()}
            </span>
          </div>
          <h2 id="forge-readiness-title" className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <StateIcon className="size-5 text-[var(--color-muted-foreground)]" aria-hidden="true" />
            {content.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">{content.description}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="mr-2 min-w-24">
            <div className="text-2xl font-semibold tabular-nums">{snapshot.readyCount}<span className="text-base font-normal text-[var(--color-muted-foreground)]"> / {snapshot.totalCount}</span></div>
            <div className="text-xs text-[var(--color-muted-foreground)]">依赖已就绪</div>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={refreshing || busy}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            重新检测
          </Button>
          <Button onClick={onInitialize} disabled={busy}>
            <WandSparkles />
            {initializing ? '正在初始化' : snapshot.ready ? '检查并补齐' : '一键初始化'}
          </Button>
        </div>
      </div>
    </section>
  )
}
