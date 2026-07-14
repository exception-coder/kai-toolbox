import { Coins, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import type { SessionUsage } from '../api'
import { abbr, fmtMs, sessionTotals } from '../lib/metrics'

/**
 * 头部用量徽章（可点开用量面板）：累计 token（紫）+ 整会话缓存命中率（青），合并成一枚胶囊。
 * serverTotal（后端按会话 id 统计 transcript 的整会话总和）优先，缺失时退回前端对已加载 items 的累计。
 * 本会话还没有任何轮次时退化为「用量」入口。点击 → 打开本地用量面板（三引擎 + 额度）。
 */
export function SessionTotalBadge({ items, serverTotal, onClick, className }: { items: ChatItem[]; serverTotal?: SessionUsage | null; onClick?: () => void; className?: string }) {
  const local = sessionTotals(items)
  const useServer = !!serverTotal && serverTotal.turns > 0
  const tokens = useServer ? serverTotal!.totalTokens : local.tokens
  const turns = useServer ? serverTotal!.turns : local.turns
  const durationMs = local.durationMs // 后端未汇总耗时，沿用前端已加载轮次的累计
  const hitRate = useServer
    ? (() => {
        const side = serverTotal!.inputTokens + serverTotal!.cacheReadTokens + serverTotal!.cacheCreateTokens
        return side > 0 ? serverTotal!.cacheReadTokens / side : null
      })()
    : local.hitRate
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
        // 文字化：去掉高饱和双色徽章底，改中性安静文本 chip（少 dashboard 味），保留点开用量能力
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
        className,
      )}
    >
      {has ? (
        <>
          <Coins className="size-3 opacity-70" />
          <span className="text-[var(--color-foreground)]">{abbr(tokens)}</span>
          {hitRate != null && hitRate > 0 && (
            <span className="opacity-70">· 命中 {Math.floor(hitRate * 100)}%</span>
          )}
        </>
      ) : (
        <><Gauge className="size-3.5" /><span className="hidden sm:inline">用量</span></>
      )}
    </button>
  )
}
