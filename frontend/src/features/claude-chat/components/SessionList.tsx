import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { deleteSession, listSessions } from '../api'

interface Props {
  currentSessionId: string | null
  onSwitch: (sessionId: string) => void
}

const KEY = ['claude-chat-sessions']

/** 历史会话列表：点击切换/续跑，可删除。 */
export function SessionList({ currentSessionId, onSwitch }: Props) {
  const qc = useQueryClient()
  const { data: sessions = [], isPending } = useQuery({
    queryKey: KEY,
    queryFn: listSessions,
  })

  const remove = async (id: string) => {
    await deleteSession(id)
    qc.invalidateQueries({ queryKey: KEY })
  }

  if (isPending) {
    return <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">加载中…</div>
  }
  if (sessions.length === 0) {
    return <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">还没有会话，点上方「新建」开始</div>
  }

  return (
    <ul className="divide-y">
      {sessions.map(s => (
        <li
          key={s.id}
          className={cn(
            'flex items-center gap-2 px-3 py-3',
            s.id === currentSessionId && 'bg-[var(--color-accent)]',
          )}
        >
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSwitch(s.id)}>
            <div className="flex items-center gap-2">
              {s.live && <Circle className="size-2 fill-green-500 text-green-500" />}
              <span className="truncate text-sm font-medium">{s.title || shortCwd(s.cwd)}</span>
            </div>
            <div className="truncate text-xs text-[var(--color-muted-foreground)]">
              {s.cwd} · {formatDate(s.lastSeenAt)}
            </div>
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
            onClick={() => remove(s.id)}
            aria-label="删除会话"
          >
            <Trash2 className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}
