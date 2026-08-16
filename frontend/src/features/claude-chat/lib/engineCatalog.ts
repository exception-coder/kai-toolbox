import type { Engine, EngineCatalogView } from '../types'

export const STABLE_ENGINE_IDS: readonly Engine[] = ['claude', 'codex', 'opencode']

const KNOWN_ENGINE_IDS = new Set<Engine>([...STABLE_ENGINE_IDS, 'deepseekHarness'])
KNOWN_ENGINE_IDS.add('antigravity')

/**
 * 目录不可达时保留现有稳定引擎；实验引擎必须由 Sidecar 明确报告 ready + selectable，
 * 不能用列表第一项、前端环境变量或历史缓存猜测可用性。
 */
export function selectableEngineIds(catalog?: EngineCatalogView): Engine[] {
  if (!catalog || catalog.error || catalog.engines.length === 0) return [...STABLE_ENGINE_IDS]
  const result = catalog.engines.flatMap(entry => {
    if (!KNOWN_ENGINE_IDS.has(entry.id) || !entry.selectable) return []
    if (entry.availability === 'experimental' && entry.probe.status !== 'ready') return []
    return [entry.id]
  })
  return result.length > 0 ? result : [...STABLE_ENGINE_IDS]
}
