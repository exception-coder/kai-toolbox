import type { GitWorkspace } from './api'

export interface GitChangeNode {
  path: string
  name: string
  count: number
  children: GitChangeNode[]
  file?: GitWorkspace['files'][number]
}

/** Git paths use '/', including on Windows; backslashes may be literal filenames. */
export function gitChangeTree(files: GitWorkspace['files']): GitChangeNode[] {
  const root: GitChangeNode = { path: '', name: '', count: 0, children: [] }
  for (const file of files) {
    const segments = file.path.replace(/\/$/, '').split('/')
    let parent = root
    segments.forEach((name, index) => {
      const path = segments.slice(0, index + 1).join('/')
      let child = parent.children.find(node => node.path === path)
      if (!child) { child = { path, name, count: 0, children: [] }; parent.children.push(child) }
      child.count++
      if (index === segments.length - 1) child.file = file
      parent = child
    })
  }
  const compact = (nodes: GitChangeNode[]): GitChangeNode[] => nodes.map(node => {
    let result = node
    while (!result.file && result.children.length === 1 && !result.children[0].file) {
      const child = result.children[0]
      result = { ...child, name: `${result.name}/${child.name}` }
    }
    return { ...result, children: compact(result.children) }
  }).sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name))
  return compact(root.children)
}
