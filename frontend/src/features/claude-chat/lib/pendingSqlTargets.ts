import type { PendingSqlChangeType, SessionPendingSqlTarget } from '../types'

export interface PendingSqlSystemSource { id: string; name: string }
export interface PendingSqlDatasourceSource {
  id: string
  systemId: string
  env: string
  type: string
  category: string
  dbName: string | null
}
export interface PendingSqlTargetOption {
  targetKey: string
  datasourceId: string
  targetEnvironment: string
  systemName: string
  env: string
  type: string
  dbName: string | null
}

export function buildPendingSqlTargetOptions(
  systems: PendingSqlSystemSource[],
  datasources: PendingSqlDatasourceSource[],
): PendingSqlTargetOption[] {
  const systemNames = new Map(systems.map(system => [system.id, system.name]))
  return datasources
    .filter(datasource => datasource.category === 'SQL')
    .map(datasource => {
      const systemName = systemNames.get(datasource.systemId) ?? '未归属系统'
      const targetEnvironment = [systemName, datasource.env, datasource.type, datasource.dbName]
        .filter(Boolean).join(' · ')
      return {
        targetKey: `datasource:${datasource.id}`,
        datasourceId: datasource.id,
        targetEnvironment,
        systemName,
        env: datasource.env,
        type: datasource.type,
        dbName: datasource.dbName,
      }
    })
    .sort((left, right) => left.targetEnvironment.localeCompare(right.targetEnvironment, 'zh-CN'))
}

export function aggregatePendingSqlChangeType(targets: SessionPendingSqlTarget[]): PendingSqlChangeType {
  const changeTypes = new Set(targets.map(target => target.changeType))
  return changeTypes.size === 1 ? targets[0].changeType : 'MIXED'
}

export function buildPendingSqlSummary(targets: SessionPendingSqlTarget[]): string {
  return targets.map(target => [
    `-- 目标库 / 环境：${target.targetEnvironment}`,
    `-- 变更类型：${target.changeType}`,
    target.sqlText.trim(),
  ].join('\n')).join('\n\n')
}
