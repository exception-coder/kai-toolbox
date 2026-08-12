import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeTreeNode } from '../api/knowledgeApi'

interface Props {
  nodes: KnowledgeTreeNode[]
  selectedId: string | null
  onSelect: (node: KnowledgeTreeNode) => void
  defaultOpenLevel?: number
  expandAll?: boolean
}

export function KnowledgeTree({
  nodes,
  selectedId,
  onSelect,
  defaultOpenLevel = 2,
  expandAll = false,
}: Props) {
  return (
    <div className="space-y-0.5">
      {nodes.map(node => (
        <TreeRow
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          defaultOpenLevel={defaultOpenLevel}
          expandAll={expandAll}
        />
      ))}
    </div>
  )
}

function TreeRow({
  node,
  selectedId,
  onSelect,
  defaultOpenLevel,
  expandAll,
}: {
  node: KnowledgeTreeNode
  selectedId: string | null
  onSelect: Props['onSelect']
  defaultOpenLevel: number
  expandAll: boolean
}) {
  const [open, setOpen] = useState(node.level < defaultOpenLevel)
  const hasChildren = node.children.length > 0
  const category = node.nodeType === 'CATEGORY'
  const visible = expandAll || open

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) setOpen(value => !value)
          if (!category || !hasChildren) onSelect(node)
        }}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--color-muted)]/60',
          selectedId === node.id && 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
        )}
        style={{ paddingLeft: `${8 + node.level * 12}px` }}
      >
        {hasChildren ? (
          visible ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        {category ? (
          <Folder className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </button>
      {hasChildren && visible && (
        <KnowledgeTree
          nodes={node.children}
          selectedId={selectedId}
          onSelect={onSelect}
          defaultOpenLevel={defaultOpenLevel}
          expandAll={expandAll}
        />
      )}
    </div>
  )
}
