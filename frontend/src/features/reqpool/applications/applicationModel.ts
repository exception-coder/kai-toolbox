import type { RegistryProject } from '@/features/project-workspace/public-api'
import type { OpenSpecProjectSummary } from '@/features/openspec-board/public-api'

/** Windows 工作区大小写不敏感；POSIX 不把大小写不同的目录合并。 */
export function applicationPath(path?: string) {
  if (!path?.trim()) return ''
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

export function applicationWorkspaces(apps: RegistryProject[], workspaces: OpenSpecProjectSummary[]) {
  return apps.map(app => {
    const path = applicationPath(app.metadata.localPath)
    const matches = path ? workspaces.filter(workspace => applicationPath(workspace.sourcePath) === path) : []
    const duplicate = path && apps.filter(candidate => applicationPath(candidate.metadata.localPath) === path).length > 1
    return { app, workspace: matches.length === 1 && !duplicate ? matches[0] : undefined, ambiguous: Boolean(duplicate || matches.length > 1) }
  })
}
