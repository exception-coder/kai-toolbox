import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { abbr, fmtMs, sessionTotals } from '../lib/metrics'

/**
 * 会话累计 token 徽章（放头部）：统计本视图实时跑完轮次的 token 总量。
 * 无可统计时不渲染。hover/长按显示轮数与累计耗时明细。
 */
export function SessionTotalBadge({ items, className }: { items: ChatItem[]; className?: string }) {
  const { tokens, durationMs, turns } = sessionTotals(items)
  if (turns === 0 || tokens === 0) return null
  return (
    <span
      title={`本会话累计：${turns} 轮 · ${tokens.toLocaleString()} tokens${durationMs ? ` · ${fmtMs(durationMs)}` : ''}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
        className,
      )}
    >
      <Coins className="size-3" />{abbr(tokens)}
    </span>
  )
}
