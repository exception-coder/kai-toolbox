import { useMemo, useState } from 'react'
import { BookMarked, ChevronDown, ChevronRight, File, FileText, FolderClosed, FolderOpen } from 'lucide-react'
import type { NestedTreeNode, TreeNodeDTO } from '../types'

interface FileTreeProps {
  nodes: TreeNodeDTO[]
  currentPath: string | null
  onSelect: (path: string) => void
}

export function FileTree({ nodes, currentPath, onSelect }: FileTreeProps) {
  const root = useMemo(() => buildTree(nodes), [nodes])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([''])) // 根默认展开

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {root.children.map(child => (
        <TreeRow
          key={child.path}
          node={child}
          expanded={expanded}
          toggle={toggle}
          currentPath={currentPath}
          onSelect={onSelect}
        />
      ))}
      {root.children.length === 0 && (
        <div className="px-2 py-1 text-xs text-[var(--color-muted-foreground)]">
          目录为空
        </div>
      )}
    </div>
  )
}

interface TreeRowProps {
  node: NestedTreeNode
  expanded: Set<string>
  toggle: (path: string) => void
  currentPath: string | null
  onSelect: (path: string) => void
}

function TreeRow({ node, expanded, toggle, currentPath, onSelect }: TreeRowProps) {
  const isDir = node.kind === 'TREE'
  const isOpen = isDir && expanded.has(node.path)
  const isCurrent = currentPath === node.path
  const indentPx = node.depth * 12

  if (isDir) {
    return (
      <>
        <button
          type="button"
          onClick={() => toggle(node.path)}
          style={{ paddingLeft: indentPx + 4 }}
          className={
            'flex items-center gap-1 truncate rounded px-2 py-1 text-left transition-colors hover:bg-[var(--color-accent)]/30 ' +
            (isCurrent ? 'bg-[var(--color-accent)]/40' : '')
          }
        >
          {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-[var(--color-primary)]" /> : <FolderClosed className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen &&
          node.children.map(c => (
            <TreeRow
              key={c.path}
              node={c}
              expanded={expanded}
              toggle={toggle}
              currentPath={currentPath}
              onSelect={onSelect}
            />
          ))}
      </>
    )
  }

  const isIndexFile = INDEX_FILE_NAMES.has(node.name)
  const lower = node.name.toLowerCase()
  const icon = isIndexFile ? (
    <BookMarked className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
  ) : lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx') ? (
    <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
  ) : (
    <File className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
  )

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      style={{ paddingLeft: indentPx + 4 + 12 }}
      className={
        'flex items-center gap-1 truncate rounded px-2 py-1 text-left transition-colors hover:bg-[var(--color-accent)]/30 ' +
        (isCurrent ? 'bg-[var(--color-accent)]/40 font-medium' : '') +
        (isIndexFile && !isCurrent ? ' font-medium text-[var(--color-foreground)]' : '')
      }
    >
      {icon}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

const INDEX_FILE_NAMES = new Set([
  'INDEX.md',
  'README.md',
  '00_index.md',
  'index.md',
  'readme.md',
])

function buildTree(flat: TreeNodeDTO[]): NestedTreeNode {
  const root: NestedTreeNode = {
    path: '',
    name: '',
    kind: 'TREE',
    sha: '',
    size: null,
    parentPath: '',
    depth: -1,
    children: [],
  }
  const byPath = new Map<string, NestedTreeNode>()
  byPath.set('', root)
  // 按路径深度排序，保证父在子前
  const sorted = [...flat].sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
  for (const n of sorted) {
    const node: NestedTreeNode = { ...n, children: [] }
    byPath.set(n.path, node)
    const parent = byPath.get(n.parentPath) ?? root
    parent.children.push(node)
  }
  // 排序：目录在前，文件按名字
  const sortRecursively = (n: NestedTreeNode) => {
    n.children.sort((a, b) => {
      if ((a.kind === 'TREE') !== (b.kind === 'TREE')) return a.kind === 'TREE' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    n.children.forEach(sortRecursively)
  }
  sortRecursively(root)
  return root
}
