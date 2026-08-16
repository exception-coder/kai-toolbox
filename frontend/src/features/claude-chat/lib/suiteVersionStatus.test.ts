import { describe, expect, it } from 'vitest'
import type { SuiteStatus } from '../types'
import { suiteRemoteLabel, suiteRemoteState } from './suiteVersionStatus'

function suite(overrides: Partial<SuiteStatus> = {}): SuiteStatus {
  return {
    name: 'team-standards',
    kind: 'plugin',
    marketplace: 'team-standards',
    claudeInstalled: '1.0.0',
    codexInstalled: '1.0.0',
    available: '1.0.0',
    present: true,
    repoCommit: null,
    repoDate: null,
    behind: null,
    remoteVersion: null,
    remoteRepoCommit: null,
    remoteRepoDate: null,
    remoteChecked: false,
    remoteError: null,
    ...overrides,
  }
}

describe('suiteVersionStatus', () => {
  it('does not treat the local marketplace cache as a remote check', () => {
    expect(suiteRemoteState(suite({ available: '2.0.0' }))).toBe('unchecked')
  })

  it('marks a plugin outdated against the remote manifest version', () => {
    const status = suite({ remoteChecked: true, remoteVersion: '1.1.0' })
    expect(suiteRemoteState(status)).toBe('outdated')
    expect(suiteRemoteLabel(status)).toBe('可更新')
  })

  it('shows MCP behind count from the selected remote source', () => {
    const status = suite({ kind: 'mcp', remoteChecked: true, behind: 3 })
    expect(suiteRemoteLabel(status)).toBe('落后 3 个提交')
  })

  it('isolates a repository check failure', () => {
    expect(suiteRemoteState(suite({ remoteChecked: true, remoteError: '超时' }))).toBe('error')
  })
})
