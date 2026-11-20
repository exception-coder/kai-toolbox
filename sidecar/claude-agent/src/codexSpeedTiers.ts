/**
 * Codex 速度档位。Forge 沿用历史值：default=标准，fast=Codex 的 priority 档；
 * 其余档位（如 ultrafast）直接使用 Codex 目录中的 service tier id，新档位无需改代码。
 */
export type CodexSpeed = string
export type CodexSpeedTier = { value: string; label: string; description: string }

const TIER_ID = /^[a-z][a-z0-9_-]{0,31}$/

export function normalizeCodexSpeed(value: unknown): CodexSpeed {
  if (value === 'fast' || value === 'priority') return 'fast'
  return typeof value === 'string' && value !== 'default' && TIER_ID.test(value) ? value : 'default'
}

/** 转为 Codex 请求的 service_tier；标准速度不传，沿用线程默认。 */
export function codexServiceTier(speed: CodexSpeed): string | undefined {
  const normalized = normalizeCodexSpeed(speed)
  if (normalized === 'default') return undefined
  return normalized === 'fast' ? 'priority' : normalized
}

/** 优先读取 serviceTiers；旧版 Codex 只有 additionalSpeedTiers 时按 id 兜底。 */
export function codexSpeedTiers(
  serviceTiers?: ReadonlyArray<{ id?: unknown; name?: unknown; description?: unknown }> | null,
  legacyTiers?: readonly unknown[] | null,
): CodexSpeedTier[] {
  const declared = (serviceTiers ?? []).flatMap(tier => {
    if (typeof tier?.id !== 'string' || !TIER_ID.test(tier.id) || tier.id === 'default') return []
    return [{
      value: normalizeCodexSpeed(tier.id),
      label: typeof tier.name === 'string' && tier.name.trim() ? tier.name.trim() : tier.id,
      description: typeof tier.description === 'string' ? tier.description : '',
    }]
  })
  const tiers = declared.length ? declared : (legacyTiers ?? []).flatMap(id => typeof id === 'string'
    && id !== 'default' && TIER_ID.test(id) ? [{ value: normalizeCodexSpeed(id), label: id, description: '' }] : [])
  return tiers.filter((tier, index) => tiers.findIndex(other => other.value === tier.value) === index)
}

/** 兼容旧前端：fastSupported 仍表示 Fast 档可用。 */
export function speedFields(speedTiers: CodexSpeedTier[]) {
  return { fastSupported: speedTiers.some(tier => tier.value === 'fast'), speedTiers }
}