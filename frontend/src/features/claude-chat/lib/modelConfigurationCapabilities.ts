import type { Engine, ModelInfo } from '../types'

/** 引擎目录中已声明的能力；未知不是不支持，也不推测可选项。 */
export interface EngineModelCapabilities {
  model: ModelInfo | undefined
  reasoning: { options: string[]; defaultValue: string | null } | null
  speed: { options: Array<'default' | 'fast'> } | null
  known: boolean
}

export function modelConfigurationCapabilities(engine: Engine, models: ModelInfo[], modelId: string | null): EngineModelCapabilities {
  const model = models.find(item => item.value === modelId || (modelId && item.resolvedModel === modelId))
    ?? (!modelId ? models.find(item => item.isDefault) : undefined)
  if (!model) return { model: undefined, reasoning: null, speed: null, known: false }
  if (engine === 'claude') {
    const levels = model.supportedEffortLevels ?? []
    return {
      model,
      reasoning: model.supportsEffort === true && levels.length
        ? { options: ['auto', ...levels], defaultValue: 'auto' } : null,
      speed: null,
      known: model.supportsEffort === false || (model.supportsEffort === true && levels.length > 0),
    }
  }
  if (engine === 'codex' || engine === 'antigravity') {
    return {
      model,
      reasoning: model.reasoningEfforts?.length
        ? { options: model.reasoningEfforts, defaultValue: model.defaultReasoningEffort ?? null } : null,
      speed: engine === 'codex' && model.fastSupported === true ? { options: ['default', 'fast'] } : null,
      known: Boolean(model.reasoningEfforts?.length),
    }
  }
  return { model, reasoning: null, speed: null, known: true }
}

export const REASONING_LABELS: Record<string, string> = {
  auto: '自动', minimal: '最低', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最大', ultra: '极致',
}
