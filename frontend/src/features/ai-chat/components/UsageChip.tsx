import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchUsage } from '../api'
import type { UsageInfo } from '../types'

/**
 * 标题栏用量 chip：展示当前 key 已用额度（取自网关 /api/usage/token，凭 key 即可）。
 * 点击展开明细弹层（令牌/已用/额度/授予/过期）——移动端无 hover，靠弹层而非 tooltip 看全部字段。
 */
export function UsageChip() {
  const [data, setData] = useState<UsageInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      setData(await fetchUsage())
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // 点击外部 / Esc 关闭明细弹层
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cur = data?.currency || '¥'
  const money = (v?: number | null) => (v == null ? '—' : `${cur}${v.toFixed(2)}`)
  const label = data?.available && data.usedAmount != null ? `已用 ${money(data.usedAmount)}` : '用量'

  const rows: [string, string][] = data?.available
    ? [
        ['令牌', data.tokenName || '—'],
        ['已用', money(data.usedAmount)],
        ['额度', data.unlimited ? '无限' : `剩余 ${money(data.remainingAmount)}`],
        ['授予', data.grantedAmount != null ? money(data.grantedAmount) : '—'],
        ['过期', data.expiresAt ? new Date(data.expiresAt * 1000).toLocaleString() : '永不过期'],
      ]
    : []

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="点击查看用量明细"
        className="inline-flex items-center gap-1 rounded-full border bg-[var(--color-background)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Wallet className="size-3.5" />}
        <span className="tabular-nums">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border bg-[var(--color-background)] shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium">用量明细</span>
            <button
              type="button"
              onClick={load}
              title="刷新"
              className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          </div>
          <div className="p-3 text-xs">
            {!data ? (
              <p className="text-[var(--color-muted-foreground)]">加载中…</p>
            ) : !data.available ? (
              <p className="text-[var(--color-destructive)]">查询失败：{data.error ?? '未知'}</p>
            ) : (
              <div className="space-y-1.5">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="w-12 shrink-0 text-[var(--color-muted-foreground)]">{k}</span>
                    <span className="min-w-0 flex-1 break-words tabular-nums text-[var(--color-foreground)]">{v}</span>
                  </div>
                ))}
                <p className="pt-1 text-[10px] text-[var(--color-muted-foreground)]">
                  数据来自网关 /api/usage/token（计费口径，缓存折扣已含）
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
