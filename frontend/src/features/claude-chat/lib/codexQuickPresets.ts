import type { CodexReasoningEffort, ModelInfo } from '../types'

export interface CodexQuickPreset {
  model: string
  modelLabel: string
  effort: CodexReasoningEffort
  effortLabel: string
  label: string
  fastSupported: boolean
}

export const QUICK_EFFORT_LABELS: Record<string, string> = {
  minimal: '最低', low: '轻度', medium: '标准', high: '深入', xhigh: '超高', max: '最大', ultra: '极致',
}

/** 目录顺序由引擎持有；只投影明确支持的常用组合，隐藏档位仍在自定义中。 */
export function codexQuickPresets(models: ModelInfo[]): CodexQuickPreset[] {
  const luna = models.find(model => /(?:^|[-\s])luna$/i.test(model.value))
  const sol = models.find(model => /(?:^|[-\s])sol$/i.test(model.value))
    ?? models.find(model => model.isDefault) ?? models[0]
  const astra = models.find(model => /(?:^|[-\s])astra$/i.test(model.value))
  const candidates: Array<[ModelInfo | undefined, string]> = [
    [luna, 'low'], [sol, 'low'], [sol, 'medium'], [sol, 'high'], [astra ?? sol, 'high'], [astra ?? sol, 'xhigh'],
  ]
  const seen = new Set<string>()
  return candidates.flatMap(([model, effort]) => {
    if (!model?.reasoningEfforts?.includes(effort)) return []
    const key = `${model.value}:${effort}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ model: model.value, modelLabel: model.displayName, effort, effortLabel: QUICK_EFFORT_LABELS[effort],
      label: `${model.displayName} ${QUICK_EFFORT_LABELS[effort]}`, fastSupported: model.fastSupported !== false }]
  })
}
