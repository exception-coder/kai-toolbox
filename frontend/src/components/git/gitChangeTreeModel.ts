export interface GitChangeFile {
  path: string
  x: string
  y: string
  origPath: string | null
}

export interface GitChangeNode<T extends GitChangeFile = GitChangeFile> {
  path: string
  name: string
  count: number
  children: GitChangeNode<T>[]
  file?: T
}

/** Git paths use '/', including on Windows; backslashes may be literal filenames. */
export function gitChangeTree<T extends GitChangeFile>(files: readonly T[]): GitChangeNode<T>[] {
  const root: GitChangeNode<T> = { path: '', name: '', count: 0, children: [] }
  const children = new WeakMap<GitChangeNode<T>, Map<string, GitChangeNode<T>>>()
  for (const file of files) {
    const segments = file.path.replace(/\/$/, '').split('/')
    let parent = root
    let path = ''
    segments.forEach((name, index) => {
      path = path ? `${path}/${name}` : name
      let indexByName = children.get(parent)
      if (!indexByName) { indexByName = new Map(); children.set(parent, indexByName) }
      let child = indexByName.get(name)
      if (!child) {
        child = { path, name, count: 0, children: [] }
        indexByName.set(name, child)
        parent.children.push(child)
      }
      child.count++
      if (index === segments.length - 1) child.file = file
      parent = child
    })
  }
  const compact = (nodes: GitChangeNode<T>[]): GitChangeNode<T>[] => nodes.map(node => {
    let result = node
    while (!result.file && result.children.length === 1 && !result.children[0].file) {
      const child = result.children[0]
      result = { ...child, name: `${result.name}/${child.name}` }
    }
    return { ...result, children: compact(result.children) }
  }).sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name))
  return compact(root.children)
}
