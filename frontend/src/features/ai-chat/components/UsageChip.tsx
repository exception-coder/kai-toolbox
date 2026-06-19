import { useEffect, useState } from 'react'
import { Loader2, Wallet } from 'lucide-react'
import { fetchUsage } from '../api'
import type { UsageInfo } from '../types'

const usd = (v?: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`)

/**
 * 标题栏用量 chip：展示当前 key 的已用额度（取自网关 /api/usage/token，凭 key 即可）。
 * tooltip 给令牌名 / 无限或剩余 / 过期；点击刷新。请求级/按模型明细需账号登录态，不在此。
 */
export function UsageChip() {
  const [data, setData] = useState<UsageInfo | null>(null)
  const [loading, setLoading] = useState(false)

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

  const title = !data
    ? '点击查询用量'
    : !data.available
      ? `用量查询失败：${data.error ?? '未知'}（点击重试）`
      : [
          `令牌：${data.tokenName || '—'}`,
          data.unlimited ? '额度：无限' : `剩余：${usd(data.remainingUsd)}`,
          data.grantedUsd != null ? `授予：${usd(data.grantedUsd)}` : null,
          data.expiresAt ? `过期：${new Date(data.expiresAt * 1000).toLocaleDateString()}` : '永不过期',
          '点击刷新',
        ]
          .filter(Boolean)
          .join(' · ')

  const label = data?.available && data.usedUsd != null ? `已用 ${usd(data.usedUsd)}` : '用量'

  return (
    <button
      type="button"
      onClick={load}
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-[var(--color-background)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Wallet className="size-3.5" />}
      <span className="tabular-nums">{label}</span>
    </button>
  )
}
