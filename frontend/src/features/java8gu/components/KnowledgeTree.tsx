import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeTreeNode } from '../api/knowledgeApi'

interface Props {
  nodes: KnowledgeTreeNode[]
  selectedId: string | null
  onSelect: (node: KnowledgeTreeNode) => void
}

export function KnowledgeTree({ nodes, selectedId, onSelect }: Props) {
  return <div className="space-y-0.5">{nodes.map(node => <TreeRow key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />)}</div>
}

function TreeRow({ node, selectedId, onSelect }: { node: KnowledgeTreeNode; selectedId: string | null; onSelect: Props['onSelect'] }) {
  const [open, setOpen] = useState(node.level < 2)
  const hasChildren = node.children.length > 0
  const category = node.nodeType === 'CATEGORY'

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
        {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
        {category ? <Folder className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
        <span className="truncate">{node.title}</span>
      </button>
      {hasChildren && open && <KnowledgeTree nodes={node.children} selectedId={selectedId} onSelect={onSelect} />}
    </div>
  )
}
