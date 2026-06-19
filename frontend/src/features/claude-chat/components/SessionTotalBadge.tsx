import { Coins, Database, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { abbr, fmtMs, sessionTotals } from '../lib/metrics'

/**
 * 头部用量徽章（可点开用量面板）：累计 token（紫）+ 整会话缓存命中率（青），合并成一枚胶囊。
 * 本会话还没有实时轮次时退化为「用量」入口。点击 → 打开本地用量面板（三引擎 + 额度）。
 */
export function SessionTotalBadge({ items, onClick, className }: { items: ChatItem[]; onClick?: () => void; className?: string }) {
  const { tokens, durationMs, turns, hitRate } = sessionTotals(items)
  const has = turns > 0 && tokens > 0
  const title = has
    ? `本会话累计：${turns} 轮 · ${tokens.toLocaleString()} tokens${hitRate != null ? ` · 命中 ${Math.floor(hitRate * 100)}%` : ''}${durationMs ? ` · ${fmtMs(durationMs)}` : ''}｜点击看本地用量`
    : '本地用量（token / 缓存 / 额度）'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label="本地用量"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums hover:opacity-80',
        has
          ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300'
          : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
        className,
      )}
    >
      {has ? (
        <>
          <span className="inline-flex items-center gap-1"><Coins className="size-3" />{abbr(tokens)}</span>
          {hitRate != null && hitRate > 0 && (
            <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400"><Database className="size-3" />{Math.floor(hitRate * 100)}%</span>
          )}
        </>
      ) : (
        <><Gauge className="size-3.5" /><span className="hidden sm:inline">用量</span></>
      )}
    </button>
  )
}
