import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeSubscriptionQuota, readCodexSubscriptionQuota } from './codexSubscriptionQuota.js'

const snapshot = { limitId: 'codex', planType: 'pro', primary: { usedPercent: 22.5, windowDurationMins: 10_080, resetsAt: 2_000_000_000 }, secondary: { usedPercent: 90, windowDurationMins: 300, resetsAt: null } }

test('按真实时长映射剩余，保留服务商重置时间及实际获取时间', () => {
  const quota = normalizeSubscriptionQuota({ rateLimits: snapshot }, undefined, 1234)
  assert.equal(quota.fetchedAt, 1234)
  assert.deepEqual(quota.windows, [
    { windowMinutes: 10_080, remainingPercent: 77.5, resetsAt: 2_000_000_000 },
    { windowMinutes: 300, remainingPercent: 10, resetsAt: null },
  ])
  assert.equal(quota.shared, true)
})

test('优先匹配模型配额组，否则只取明确的通用组', () => {
  const groups = { codex: snapshot, special: { ...snapshot, limitId: 'special', normalModelSlug: 'model-a', primary: { usedPercent: 50, windowDurationMins: 15 } } }
  assert.equal(normalizeSubscriptionQuota({ rateLimitsByLimitId: groups }, 'model-a').windows[0].remainingPercent, 50)
  assert.equal(normalizeSubscriptionQuota({ rateLimitsByLimitId: groups }, 'model-b').windows[0].remainingPercent, 77.5)
  assert.equal(normalizeSubscriptionQuota({ rateLimitsByLimitId: { a: { limitId: 'a' }, b: { limitId: 'b' } } }).available, false)
})

test('缺失或非法窗口不会伪造余额和获取时间', () => {
  for (const usedPercent of [NaN, Infinity, -1, 101, '20', null]) {
    const quota = normalizeSubscriptionQuota({ rateLimits: { primary: { usedPercent, windowDurationMins: 300 } } })
    assert.equal(quota.available, false)
    assert.equal(quota.fetchedAt, null)
  }
  assert.equal(normalizeSubscriptionQuota({ rateLimits: { primary: { usedPercent: 20, windowDurationMins: null } } }).available, false)
})

test('两个账号并发查询各自目录，API与未登录账号不查询配额', async () => {
  const calls: Array<[string, string | undefined]> = []
  const request = async (method: string, _params: Record<string, unknown>, home?: string) => {
    calls.push([method, home])
    if (method === 'account/read') return { account: { type: home === 'api' ? 'apiKey' : 'chatgpt' } }
    return { rateLimits: { ...snapshot, primary: { usedPercent: home === 'a' ? 10 : 80, windowDurationMins: 300 } } }
  }
  const fingerprint = async () => 'stable'
  const [a, b, api] = await Promise.all(['a', 'b', 'api'].map(home => readCodexSubscriptionQuota(home, undefined, request, fingerprint)))
  assert.equal(a.windows[0].remainingPercent, 90)
  assert.equal(b.windows[0].remainingPercent, 20)
  assert.equal(api.available, false)
  assert.equal(calls.some(([method, home]) => home === 'api' && method === 'account/rateLimits/read'), false)
})

test('账号切换和异常拒绝快照，不泄露供应商错误正文', async () => {
  let count = 0
  const quota = await readCodexSubscriptionQuota('a', undefined, async method => method === 'account/read' ? { account: { type: 'chatgpt' } } : { rateLimits: snapshot }, async () => String(count++))
  assert.equal(quota.available, false)
  const failed = await readCodexSubscriptionQuota('a', undefined, async () => { throw new Error('SECRET') }, async () => 'stable')
  assert.equal(JSON.stringify(failed).includes('SECRET'), false)
  assert.equal(failed.fetchedAt, null)
})
