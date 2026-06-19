import type { MessageMetrics } from '../types'

/**
 * token 数量阶梯式中文单位：千 / 万 / 百万 / 千万 / 亿。
 * <1000 原样；保留 1 位小数（整数不带 .0）。例：1234→1.2千，15000→1.5万。
 */
export function abbr(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  const f = (v: number) => {
    const s = v.toFixed(1)
    return s.endsWith('.0') ? s.slice(0, -2) : s
  }
  if (n < 1e3) return String(Math.round(n))
  if (n < 1e4) return f(n / 1e3) + '千'
  if (n < 1e6) return f(n / 1e4) + '万'
  if (n < 1e7) return f(n / 1e6) + '百万'
  if (n < 1e8) return f(n / 1e7) + '千万'
  return f(n / 1e8) + '亿'
}

/** 毫秒 → 友好耗时：<1s 显 ms，否则秒。无值返回空串。 */
export function fmtMs(ms?: number | null): string {
  if (ms == null || ms < 0) return ''
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** 消息时间：当天显示 HH:mm，跨天显示 MM-DD HH:mm；无 ts 返回空串。 */
export function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

/**
 * 缓存命中率 = 缓存读 / 输入侧 token，0~1；无输入侧 token 或无缓存数据时返回 null。
 * promptTokens 已含缓存读部分，故分母直接取 promptTokens。
 */
export function cacheHitRate(m: MessageMetrics): number | null {
  const prompt = m.promptTokens ?? 0
  const cached = m.cachedTokens
  if (cached == null || prompt <= 0) return null
  return Math.min(1, cached / prompt)
}

/** 该消息是否有任何可展示的指标（耗时 / token）。 */
export function hasMetrics(m: MessageMetrics): boolean {
  return m.latencyMs != null || m.totalTokens != null || m.promptTokens != null || m.completionTokens != null
}
