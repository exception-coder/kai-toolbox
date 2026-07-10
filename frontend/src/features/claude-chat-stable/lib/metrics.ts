import type { ChatItem } from '../types'

/**
 * token 数量阶梯式中文单位：千 / 万 / 百万 / 千万 / 亿。
 * <1000 原样；保留 1 位小数（整数不带 .0）。
 * 例：856→856，1234→1.2千，15000→1.5万，1200000→1.2百万，12000000→1.2千万，120000000→1.2亿。
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

/** 毫秒 → 友好耗时：<1s 显 ms，否则秒。 */
export function fmtMs(ms?: number): string {
  if (ms == null || ms < 0) return ''
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** 消息块时间：当天显示 HH:mm，跨天显示 MM-DD HH:mm；无 ts 返回空串。 */
export function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

/**
 * usage（各引擎键名不一）→ 输入/输出/缓存/缓存命中(读)/总计；无返回 null。
 * cache = 缓存读(命中) + 缓存写(创建)；cacheRead = 仅命中部分（≈免费，成本约 1/10）。
 */
export function parseUsage(u?: Record<string, number>): { input: number; output: number; cache: number; cacheRead: number; total: number } | null {
  if (!u) return null
  let input = 0, output = 0, cache = 0, cacheRead = 0, total = 0
  for (const [k, v] of Object.entries(u)) {
    total += v
    if (k.includes('cache')) {
      cache += v
      if (k.includes('read')) cacheRead += v
    } else if (k.includes('input')) input += v
    else if (k.includes('output')) output += v
  }
  return { input, output, cache, cacheRead, total }
}

/**
 * 缓存命中率 = 缓存读 / 输入侧总量(普通输入 + 缓存读 + 缓存写)，0~1；无输入侧 token 返回 null。
 * 反映本轮有多大比例的输入直接命中缓存（≈不消耗）。
 */
export function cacheHitRate(u?: Record<string, number>): number | null {
  const p = parseUsage(u)
  if (!p) return null
  const inputSide = p.input + p.cache
  if (inputSide <= 0) return null
  return p.cacheRead / inputSide
}

/**
 * 会话累计指标：把当前消息流里所有 result 项的 token / 耗时累加。
 * 仅统计本视图实时跑完的轮次（历史 transcript 无 result 行，故不计入）。
 */
export function sessionTotals(items: ChatItem[]): {
  tokens: number; durationMs: number; turns: number
  cacheRead: number; inputSide: number
  /** 整会话缓存命中率 = 缓存读 / 输入侧总量；无输入侧 token 时为 null */
  hitRate: number | null
} {
  let tokens = 0, durationMs = 0, turns = 0, cacheRead = 0, inputSide = 0
  for (const it of items) {
    if (it.kind !== 'result') continue
    turns++
    const u = parseUsage(it.usage)
    if (u) {
      tokens += u.total
      cacheRead += u.cacheRead
      inputSide += u.input + u.cache
    }
    if (it.latencyMs != null) durationMs += it.latencyMs
  }
  return { tokens, durationMs, turns, cacheRead, inputSide, hitRate: inputSide > 0 ? cacheRead / inputSide : null }
}
