import type { SuiteStatus } from '../types'

export type SuiteRemoteState = 'unchecked' | 'error' | 'current' | 'outdated' | 'unknown'

/** 将插件版本和 MCP 提交差异归约为统一的远端版本状态。 */
export function suiteRemoteState(suite: SuiteStatus): SuiteRemoteState {
  if (!suite.remoteChecked) return 'unchecked'
  if (suite.remoteError) return 'error'
  if (suite.kind === 'mcp') {
    if (suite.behind == null) return 'unknown'
    return suite.behind === 0 ? 'current' : 'outdated'
  }
  if (!suite.remoteVersion) return 'unknown'
  const installed = [suite.claudeInstalled, suite.codexInstalled].filter((version): version is string => Boolean(version))
  if (installed.length === 0) return 'unknown'
  return installed.every(version => version === suite.remoteVersion) ? 'current' : 'outdated'
}

/** 返回团队依赖卡片的简短状态文案。 */
export function suiteRemoteLabel(suite: SuiteStatus): string {
  const state = suiteRemoteState(suite)
  if (state === 'unchecked') return '未检查远端'
  if (state === 'error') return '检测失败'
  if (state === 'current') return '已最新'
  if (state === 'outdated') return suite.kind === 'mcp' && suite.behind != null
    ? `落后 ${suite.behind} 个提交`
    : '可更新'
  return '远端版本未知'
}
