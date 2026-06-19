import { Coins, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { abbr, fmtMs, sessionTotals } from '../lib/metrics'

/**
 * 会话累计指标徽章（放头部）：累计 token（紫）+ 整会话缓存命中率（青）。
 * 统计本视图所有 result 项（含历史 transcript 还原的轮次）；无可统计时不渲染。
 */
export function SessionTotalBadge({ items, className }: { items: ChatItem[]; className?: string }) {
  const { tokens, durationMs, turns, hitRate } = sessionTotals(items)
  if (turns === 0 || tokens === 0) return null
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      <span
        title={`本会话累计：${turns} 轮 · ${tokens.toLocaleString()} tokens${durationMs ? ` · ${fmtMs(durationMs)}` : ''}`}
        className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
      >
        <Coins className="size-3" />{abbr(tokens)}
      </span>
      {hitRate != null && hitRate > 0 && (
        <span
          title="整会话缓存命中率（命中部分≈不计费）"
          className="hidden min-[420px]:inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300"
        >
          <Database className="size-3" />{Math.floor(hitRate * 100)}%
        </span>
      )}
    </span>
  )
}
