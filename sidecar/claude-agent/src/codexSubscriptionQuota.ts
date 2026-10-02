import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { callAppServer } from './codexAppServer.js'

export interface SubscriptionQuota {
  available: boolean
  message?: string
  fetchedAt: number | null
  planType?: string
  shared: boolean
  limitName?: string
  windows: Array<{ windowMinutes: number; remainingPercent: number; resetsAt: number | null }>
}

export const unavailableQuota = (message: string): SubscriptionQuota => ({
  available: false, message, fetchedAt: null, shared: true, windows: [],
})

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

/** 只接受实际返回的窗口；未知时长不能被包装成五小时或周额度。 */
export function normalizeSubscriptionQuota(result: Record<string, unknown>, model?: string, now = Date.now()): SubscriptionQuota {
  const groups = Object.values(record(result.rateLimitsByLimitId) ?? {}).map(record).filter(group => group != null)
  const legacy = record(result.rateLimits)
  if (groups.length === 0 && legacy) groups.push(legacy)
  const selected = groups.find(group => model && group.normalModelSlug === model)
    ?? groups.find(group => group.limitId === 'codex')
    ?? (groups.length === 1 ? groups[0] : undefined)
  if (!selected) return unavailableQuota('服务商未返回可确认的当前账号配额组')
  const windows: SubscriptionQuota['windows'] = []
  for (const value of [selected.primary, selected.secondary]) {
    const window = record(value)
    if (!window || typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent)
      || window.usedPercent < 0 || window.usedPercent > 100
      || typeof window.windowDurationMins !== 'number' || !Number.isFinite(window.windowDurationMins)
      || window.windowDurationMins <= 0) continue
    windows.push({
      windowMinutes: window.windowDurationMins,
      remainingPercent: 100 - window.usedPercent,
      resetsAt: typeof window.resetsAt === 'number' && Number.isFinite(window.resetsAt) && window.resetsAt > 0
        ? window.resetsAt : null,
    })
  }
  if (!windows.length) return unavailableQuota('服务商未返回有效配额窗口')
  return {
    available: true, fetchedAt: now, shared: true, windows,
    limitName: typeof selected.limitName === 'string' ? selected.limitName : undefined,
    planType: typeof selected.planType === 'string' ? selected.planType : undefined,
  }
}

async function authFingerprint(home: string): Promise<string> {
  try { return createHash('sha256').update(await readFile(join(home, 'auth.json'))).digest('hex') }
  catch { return 'unreadable' }
}

/** 指纹只在进程内使用；不把账号、邮箱、凭据或供应商错误正文发给客户端。 */
export async function readCodexSubscriptionQuota(
  codexHome?: string, model?: string,
  request: typeof callAppServer = callAppServer,
  fingerprint: (home: string) => Promise<string> = authFingerprint,
): Promise<SubscriptionQuota> {
  const home = codexHome?.trim() || process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  try {
    const before = await fingerprint(home)
    if (before === 'unreadable') return unavailableQuota('当前账号登录信息无法读取')
    const account = record((await request('account/read', { refreshToken: false }, home)).account)
    if (account?.type !== 'chatgpt') return unavailableQuota('当前账号不是可查询额度的 ChatGPT 订阅')
    const result = await request('account/rateLimits/read', {}, home)
    if (before !== await fingerprint(home)) return unavailableQuota('账号登录状态已变化，请重新获取')
    return normalizeSubscriptionQuota(result, model)
  } catch { return unavailableQuota('订阅额度请求失败，请稍后重试') }
}
