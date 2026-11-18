import { KNOWN_ENGINE_IDS } from '../lib/engineCatalog'
import type { EngineCatalogView, SidecarEngineVersion } from '../types'
import { engineName } from './chatStatus'

// This allowlist mirrors the existing Sidecar upgrade endpoint, which also validates every ID.
const BATCH_SDK_IDS = new Set(['claude', 'codex', 'qwen', 'opencode'])
const EXTERNAL_CLI_IDS = new Set(['trae', 'zcode', 'hermes', 'antigravity'])

export function engineDependencyRows(catalog?: EngineCatalogView, versions: SidecarEngineVersion[] = []) {
  const probes = new Map<string, EngineCatalogView['engines'][number]>(catalog?.engines.map(engine => [engine.id, engine]))
  const packages = new Map<string, SidecarEngineVersion>(versions.map(engine => [engine.id, engine]))
  const ids = new Set<string>([...probes.keys(), ...KNOWN_ENGINE_IDS, ...packages.keys()])
  return [...ids].map(id => {
    const version = packages.get(id)
    const entry = probes.get(id)
    const known = KNOWN_ENGINE_IDS.find(engine => engine === id)
    const upgradeable = BATCH_SDK_IDS.has(id)
    return {
      id,
      name: entry?.displayName || version?.name || (id === 'claude' ? 'Claude Code' : known ? engineName(known) : id),
      version,
      probe: entry?.probe,
      selectable: entry?.selectable,
      upgradeable,
      upgradeMode: upgradeable ? '支持批量升级' : EXTERNAL_CLI_IDS.has(id) ? '外部运行时 · 单独维护' : '暂未开放面板升级',
    }
  })
}

export type EngineDependencyRow = ReturnType<typeof engineDependencyRows>[number]
