import type { GitBranchRef } from './types'

export function branchSource(branch: GitBranchRef) {
  return branch.remote ? branch.remoteName ?? branch.name.split('/')[0] : '本地'
}

/** Presentation groups retain every exact Git ref and commit independently. */
export function groupBranches(branches: GitBranchRef[]) {
  const groups = new Map<string, { name: string; sources: GitBranchRef[]; current: boolean }>()
  for (const branch of branches) {
    const name = branch.logicalName ?? (branch.remote ? branch.name.slice(branch.name.indexOf('/') + 1) : branch.name)
    const key = name && branch.ref !== 'HEAD' ? `branch:${name}` : `ref:${branch.ref}`
    const group = groups.get(key) ?? { name: name || branch.name, sources: [], current: false }
    group.sources.push(branch)
    group.current ||= branch.current
    groups.set(key, group)
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name))
}
