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

const GROUP_ORDER = ['今天', '昨天', '本周', '本月', '更早'] as const
type GroupLabel = (typeof GROUP_ORDER)[number]

/** 按 updatedAt 归入时间分组。基于本地日 0 点边界，避免「23:59 算昨天」之类偏差。 */
function groupOf(updatedAt: number): GroupLabel {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86_400_000
  if (updatedAt >= startOfToday) return '今天'
  if (updatedAt >= startOfToday - day) return '昨天'
  if (updatedAt >= startOfToday - 6 * day) return '本周'
  if (updatedAt >= startOfToday - 29 * day) return '本月'
  return '更早'
}

export function ConversationList({ conversations, activeId, onSelect, onNew, onRename, onDelete }: Props) {
  // 已按 updatedAt 倒序传入；按分组归集并保持组内原序
  const grouped = GROUP_ORDER
    .map((label) => ({ label, items: conversations.filter((c) => groupOf(c.updatedAt) === label) }))
    .filter((g) => g.items.length > 0)

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
          <p className="px-2 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
            还没有对话，点上方「新对话」开始
          </p>
        )}
        {grouped.map((g) => (
          <div key={g.label} className="mb-1">
            <div className="px-2 pb-1 pt-3 text-[11px] font-medium text-[var(--color-muted-foreground)]">{g.label}</div>
            {g.items.map((c) => (
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
                  onClick={(e) => { e.stopPropagation(); onRename(c.id) }}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="删除"
                  onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}
                >
                  <Trash2 className="size-3.5 text-[var(--color-destructive)]" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
