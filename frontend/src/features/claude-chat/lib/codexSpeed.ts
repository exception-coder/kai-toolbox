import type { CodexSpeed, ModelInfo } from '../types'

/** Forge 速度值：default=标准，fast=Codex priority，其余为 Codex 目录中的档位 id。 */
export interface CodexSpeedOption { value: CodexSpeed; label: string; description: string }

const KNOWN_LABELS: Record<string, string> = { default: '标准', fast: '快速', ultrafast: '超快' }

function declaredTiers(model: ModelInfo | undefined) {
  if (model?.speedTiers) return model.speedTiers
  return model?.fastSupported === true ? [{ value: 'fast', label: 'Fast', description: '' }] : []
}

/** 标准 + 模型目录声明的档位；旧目录没有 speedTiers 时按 fastSupported 兜底。 */
export function codexSpeedOptions(model: ModelInfo | undefined): CodexSpeedOption[] {
  return [{ value: 'default', label: KNOWN_LABELS.default, description: '' },
    ...declaredTiers(model).map(tier => ({ value: tier.value, label: KNOWN_LABELS[tier.value] ?? tier.label, description: tier.description }))]
}

export function codexSpeedLabel(speed: CodexSpeed | null | undefined, model?: ModelInfo): string {
  if (!speed) return KNOWN_LABELS.default
  return KNOWN_LABELS[speed] ?? declaredTiers(model).find(tier => tier.value === speed)?.label ?? speed
}

/** 目录未知时不阻止已保存的选择；已知目录只接受声明过的档位。 */
export function codexSpeedSupported(model: ModelInfo | undefined, speed: CodexSpeed): boolean {
  if (speed === 'default' || !model) return true
  if (model.speedTiers) return model.speedTiers.some(tier => tier.value === speed)
  return speed === 'fast' && model.fastSupported !== false
}

export function normalizeCodexSpeed(value: unknown): CodexSpeed {
  if (value === 'fast' || value === 'priority') return 'fast'
  return typeof value === 'string' && value !== 'default' && /^[a-z][a-z0-9_-]{0,31}$/.test(value) ? value : 'default'
}
