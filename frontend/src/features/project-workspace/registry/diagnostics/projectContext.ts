import type { SystemRouteCandidate } from './types'

export interface DiagnosticProject {
  name: string
  path: string
}

/** Windows 路径忽略大小写，Unix 路径保留大小写语义。 */
export function sameSourcePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const path = value.replaceAll('\\', '/').replace(/\/+$/, '')
    return /^[A-Za-z]:\//.test(path) || path.startsWith('//') ? path.toLowerCase() : path
  }
  return Boolean(left && right && normalize(left) === normalize(right))
}

export function matchingProject(candidates: SystemRouteCandidate[], scope?: DiagnosticProject): string {
  return scope ? candidates.find(item => sameSourcePath(item.projectPath, scope.path))?.projectKey ?? '' : ''
}
