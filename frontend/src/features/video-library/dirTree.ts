import type { VideoDirectoryFacet } from './types'

/**
 * 目录树的一个节点。后端只给「目录 → 直属视频数」的扁平行，层级关系是把路径按分隔符
 * 切开在前端重建的：目录层级纯属展示形态，服务端把口径（哪些视频算数）定死就够了。
 */
export interface DirNode {
  /** 展示名。折叠链路后可能含多段，如 {@code Movies\2024}。 */
  name: string
  /** 完整绝对路径。既是选中值（传给后端的 dir 参数），也是 React key。 */
  path: string
  /** 直属视频数（不含子目录）。 */
  selfCount: number
  /** 含所有子目录的累计视频数。 */
  totalCount: number
  /** 含所有子目录的累计大小（字节）。 */
  totalSize: number
  children: DirNode[]
}

/** 路径分隔符：库里 Windows 扫描存 {@code \}，Linux/NAS 扫描存 {@code /}，逐条判断而非全局假设。 */
function detectSep(path: string): string {
  return path.includes('\\') ? '\\' : '/'
}

/**
 * 把扁平目录行建成森林。
 *
 * 中间目录（自己没有直属视频、只是路径上的一环）会被自动补出来，
 * 这样 {@code D:\a\b} 和 {@code D:\a\c} 能挂在同一个 {@code D:\a} 下。
 */
export function buildDirTree(facets: VideoDirectoryFacet[]): DirNode[] {
  const index = new Map<string, DirNode>()
  const roots: DirNode[] = []

  for (const facet of facets) {
    if (!facet.path) continue
    const sep = detectSep(facet.path)
    const raw = facet.path.split(sep)
    // POSIX 绝对路径 "/mnt/a" 切出来首段是空串；UNC "\\server\share" 是两个空串。
    const uncPrefix = raw[0] === '' && raw[1] === '' ? sep + sep : ''
    const absPrefix = !uncPrefix && raw[0] === '' ? sep : ''
    const segments = raw.filter(Boolean)
    if (segments.length === 0) continue

    let current = ''
    let parent: DirNode | null = null
    segments.forEach((segment, i) => {
      current = i === 0 ? uncPrefix + absPrefix + segment : current + sep + segment
      let node = index.get(current)
      if (!node) {
        node = { name: segment, path: current, selfCount: 0, totalCount: 0, totalSize: 0, children: [] }
        index.set(current, node)
        if (parent) parent.children.push(node)
        else roots.push(node)
      }
      parent = node
    })

    const leaf = index.get(current)
    if (leaf) {
      // 同一目录理论上只出现一次，用 += 是为了容忍后端返回重复行（不同扫描根覆盖同一路径）。
      leaf.selfCount += facet.count
      leaf.totalSize += facet.size
    }
  }

  roots.forEach(aggregate)
  return roots.map(collapse).sort(compareNodes)
}

/** 自下而上求和：累计视频数 / 累计大小。深度受路径长度天然约束，递归安全。 */
function aggregate(node: DirNode): void {
  let count = node.selfCount
  let size = node.totalSize
  for (const child of node.children) {
    aggregate(child)
    count += child.totalCount
    size += child.totalSize
  }
  node.totalCount = count
  node.totalSize = size
  node.children.sort(compareNodes)
}

/**
 * 折叠「自己没有视频且只有一个子目录」的链路，把 {@code D: → 媒体 → 电影} 压成一行
 * {@code D:\媒体\电影}。扫描根往往很深，不折叠的话用户要点五六层才看到第一批视频。
 */
function collapse(node: DirNode): DirNode {
  const children = node.children.map(collapse)
  if (node.selfCount === 0 && children.length === 1) {
    const only = children[0]
    return { ...only, name: node.name + detectSep(only.path) + only.name }
  }
  return { ...node, children }
}

/** 视频多的目录排前面，同数量按名称自然序（数字段按大小而非字典序）。 */
function compareNodes(a: DirNode, b: DirNode): number {
  if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount
  return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

/**
 * 按关键词过滤目录树：节点自身路径命中，或任一子孙命中，就保留（子孙命中时保留祖先链，
 * 否则用户会看到一堆没有上下文的叶子）。返回新树，不改原树。
 */
export function filterDirTree(nodes: DirNode[], query: string): DirNode[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return nodes
  const walk = (node: DirNode): DirNode | null => {
    const children = node.children.map(walk).filter((n): n is DirNode => n !== null)
    const selfHit = node.name.toLowerCase().includes(keyword) || node.path.toLowerCase().includes(keyword)
    if (!selfHit && children.length === 0) return null
    return { ...node, children }
  }
  return nodes.map(walk).filter((n): n is DirNode => n !== null)
}

/** 收集所有节点路径，供「过滤时全展开」用。 */
export function collectPaths(nodes: DirNode[]): string[] {
  const out: string[] = []
  const walk = (node: DirNode) => {
    out.push(node.path)
    node.children.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}
