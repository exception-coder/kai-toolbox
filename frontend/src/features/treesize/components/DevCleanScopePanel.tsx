import { Code2, MessageCircleMore } from 'lucide-react'
import { formatBytes, formatNumber } from '@/lib/utils'

export type DevCleanScope = 'development' | 'everyday'

export interface DevCleanScopeSummary {
  scope: DevCleanScope
  bytes: number
  selectedBytes: number
  groupCount: number
}

const COPY = {
  development: {
    title: '开发工具',
    description: 'IDE、包管理器、AI 工具和 API 客户端',
    icon: Code2,
  },
  everyday: {
    title: '常用软件',
    description: '浏览器、即时通信和 Windows 用户缓存',
    icon: MessageCircleMore,
  },
} satisfies Record<DevCleanScope, {
  title: string
  description: string
  icon: typeof Code2
}>

export function DevCleanScopePanel({
  summaries,
  activeScope,
  onSelect,
}: {
  summaries: DevCleanScopeSummary[]
  activeScope: DevCleanScope
  onSelect: (scope: DevCleanScope) => void
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {summaries.map(summary => {
        const copy = COPY[summary.scope]
        const Icon = copy.icon
        const active = summary.scope === activeScope
        return (
          <button
            key={summary.scope}
            type="button"
            onClick={() => onSelect(summary.scope)}
            className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
              active
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/8 shadow-md ring-1 ring-[var(--color-primary)]/20'
                : 'bg-[var(--color-card)] hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-md'
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  active
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{copy.title}</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">
                  {copy.description}
                </span>
              </span>
              <span className="text-xl font-bold tabular-nums">{formatBytes(summary.bytes)}</span>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
              <span>{formatNumber(summary.groupCount)} 类应用</span>
              <span className={summary.selectedBytes > 0 ? 'text-[var(--color-primary)]' : ''}>
                {summary.selectedBytes > 0
                  ? `已选 ${formatBytes(summary.selectedBytes)}`
                  : '点击查看明细'}
              </span>
            </div>
          </button>
        )
      })}
    </section>
  )
}
