import { Server, ShieldCheck, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Engine, ProviderKind, TurnDiag } from '../types'

interface Props {
  engine: Engine
  providerKind: ProviderKind
  diag: TurnDiag[]
  compact?: boolean
  className?: string
}

/** Codex 执行通道只读标识：实际轮次优先；尚未执行时按 provider 展示预期路由。 */
export function CodexTransportBadge({ engine, providerKind, diag, compact = false, className }: Props) {
  if (engine !== 'codex') return null
  const transport = diag[0]?.transport
    ?? (providerKind === 'thirdParty' ? 'thirdPartySdk' : 'appServer')
  const fallback = transport === 'sdkFallback'
  const thirdParty = transport === 'thirdPartySdk'
  const label = fallback ? 'SDK（已回退）' : thirdParty ? '第三方 SDK' : 'App Server'
  const title = fallback
    ? '本轮 App Server 在安全启动阶段异常，已自动回退 Codex SDK'
    : thirdParty
      ? '第三方 baseURL 会话固定使用 Codex SDK'
      : '官方 Auth 会话使用 Codex App Server；尚未执行新轮次时为预期通道'
  const Icon = fallback ? TriangleAlert : thirdParty ? Server : ShieldCheck

  return (
    <span
      title={title}
      aria-label={`Codex 通道：${label}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        fallback
          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : thirdParty
            ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
            : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
        className,
      )}
    >
      <Icon className="size-3" />
      {!compact && <span>{label}</span>}
    </span>
  )
}
