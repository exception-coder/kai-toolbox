import { fileDigest } from './repository.js'
import { requireCondition } from '../specResolution/contracts.js'

/** Explicit reviewed dependencies; legacy records retain their conservative global baseline. */
export function captureSpecDependencies(root: string, paths: string[] | undefined) {
  if (!paths) return undefined
  return Object.fromEntries([...new Set(paths)].sort().map(file => {
    requireCondition(/^openspec\/specs\/[a-zA-Z0-9][\w.-]*\/spec\.md$/.test(file), 'PATH_INVALID', '规格依赖必须是正式 capability 的 spec.md 路径')
    return [file, fileDigest(root, file)]
  }))
}

export function specsCurrent(root: string, baseline: { specRevision: string; specDependencies?: Record<string, string> }, revision: string) {
  return baseline.specDependencies
    ? Object.entries(baseline.specDependencies).every(([file, digest]) => fileDigest(root, file) === digest)
    : baseline.specRevision === revision
}
