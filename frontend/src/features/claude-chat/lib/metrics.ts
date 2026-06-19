import type { ChatItem } from '../types'

/** 数字缩写：1234 → 1.2k。 */
export function abbr(n: number): string {
  if (n < 1000) return String(n)
  return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k'
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

/** usage（各引擎键名不一）→ 输入/输出/缓存/总计；无返回 null。 */
export function parseUsage(u?: Record<string, number>): { input: number; output: number; cache: number; total: number } | null {
  if (!u) return null
  let input = 0, output = 0, cache = 0, total = 0
  for (const [k, v] of Object.entries(u)) {
    total += v
    if (k.includes('cache')) cache += v
    else if (k.includes('input')) input += v
    else if (k.includes('output')) output += v
  }
  return { input, output, cache, total }
}

/**
 * 会话累计指标：把当前消息流里所有 result 项的 token / 耗时累加。
 * 仅统计本视图实时跑完的轮次（历史 transcript 无 result 行，故不计入）。
 */
export function sessionTotals(items: ChatItem[]): { tokens: number; durationMs: number; turns: number } {
  let tokens = 0, durationMs = 0, turns = 0
  for (const it of items) {
    if (it.kind !== 'result') continue
    turns++
    const u = parseUsage(it.usage)
    if (u) tokens += u.total
    if (it.latencyMs != null) durationMs += it.latencyMs
  }
  return { tokens, durationMs, turns }
}
