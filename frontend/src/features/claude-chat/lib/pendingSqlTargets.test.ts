import { describe, expect, it } from 'vitest'
import type { SessionPendingSqlTarget } from '../types'
import {
  aggregatePendingSqlChangeType,
  buildPendingSqlSummary,
  buildPendingSqlTargetOptions,
} from './pendingSqlTargets'

function target(environment: string, changeType: 'DDL' | 'DML', sqlText: string): SessionPendingSqlTarget {
  return {
    targetId: environment,
    targetKey: `name:${environment}`,
    datasourceId: null,
    targetEnvironment: environment,
    changeType,
    sqlText,
    status: 'PENDING',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    executedAt: null,
  }
}

describe('pendingSqlTargets', () => {
  it('只把 SQL 数据源转换成目标库下拉项', () => {
    const options = buildPendingSqlTargetOptions(
      [{ id: 'erp', name: 'ERP' }],
      [
        { id: 'oracle', systemId: 'erp', env: '测试', type: 'ORACLE', category: 'SQL', dbName: 'YOOONI' },
        { id: 'redis', systemId: 'erp', env: '测试', type: 'REDIS', category: 'REDIS', dbName: null },
      ],
    )
    expect(options).toEqual([expect.objectContaining({
      targetKey: 'datasource:oracle',
      targetEnvironment: 'ERP · 测试 · ORACLE · YOOONI',
    })])
  })

  it('按目标顺序生成一份只读汇总并合并变更类型', () => {
    const targets = [
      target('ERP 测试库', 'DDL', 'ALTER TABLE sample ADD flag INT;'),
      target('SRM 测试库', 'DML', 'UPDATE sample SET flag = 1;'),
    ]
    expect(aggregatePendingSqlChangeType(targets)).toBe('MIXED')
    expect(buildPendingSqlSummary(targets)).toBe([
      '-- 目标库 / 环境：ERP 测试库\n-- 变更类型：DDL\nALTER TABLE sample ADD flag INT;',
      '-- 目标库 / 环境：SRM 测试库\n-- 变更类型：DML\nUPDATE sample SET flag = 1;',
    ].join('\n\n'))
  })
})
