import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ConversationView } from '../types'

interface Props {
  conversations: ConversationView[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
}

export function ConversationList({ conversations, activeId, onSelect, onNew, onRename, onDelete }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button className="w-full" onClick={onNew}>
          <MessageSquarePlus />
          新对话
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-[var(--color-muted-foreground)]">还没有对话</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
              c.id === activeId
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'hover:bg-[var(--color-accent)]/60',
            )}
            onClick={() => onSelect(c.id)}
          >
            <span className="min-w-0 flex-1 truncate">{c.title || '未命名'}</span>
            <button
              className="opacity-0 transition-opacity group-hover:opacity-100"
              title="重命名"
              onClick={(e) => {
                e.stopPropagation()
                onRename(c.id)
              }}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              className="opacity-0 transition-opacity group-hover:opacity-100"
              title="删除"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(c.id)
              }}
            >
              <Trash2 className="size-3.5 text-[var(--color-destructive)]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
