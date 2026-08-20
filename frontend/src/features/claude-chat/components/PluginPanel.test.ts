import { describe, expect, it } from 'vitest'
import type { TeamRepositoryStatus } from '../types'
import { dependencySyncLabel } from './PluginPanel'

function repository(overrides: Partial<TeamRepositoryStatus> = {}): TeamRepositoryStatus {
  return {
    name: 'team-standards',
    cloned: true,
    source: 'gitee',
    sourceMatches: true,
    commit: 'abc1234',
    commitDate: null,
    lastSyncedAt: null,
    behind: 0,
    ahead: 0,
    dirty: false,
    remoteChecked: true,
    ...overrides,
  }
}

describe('dependencySyncLabel', () => {
  it('shows a neutral action while repository state is loading', () => {
    expect(dependencySyncLabel(null)).toBe('一键拉取 / 更新')
  })

  it('calls out the number of repositories that need a first clone', () => {
    expect(dependencySyncLabel([
      repository(),
      repository({ name: 'project-domain-knowledge', cloned: false }),
      repository({ name: 'cross-project-topology', cloned: false }),
    ])).toBe('一键拉取（缺 2）')
  })

  it('uses update wording after all repositories have been cloned', () => {
    expect(dependencySyncLabel([repository()])).toBe('一键更新全部')
  })
})
