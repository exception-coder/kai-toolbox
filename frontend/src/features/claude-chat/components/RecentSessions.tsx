import { useQuery } from '@tanstack/react-query'
import { Clock3, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listSessions } from '../api'
import { engineDisplayName } from './chatStatus'

interface Props {
  currentSessionId: string | null
  onSwitch: (sessionId: string) => void
  limit?: number
}

const SESSION_QUERY_KEY = ['claude-chat-sessions']

export function RecentSessions({ currentSessionId, onSwitch, limit = 5 }: Props) {
  const { data: sessions = [], isPending } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: listSessions })
  const recent = [...sessions]
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, limit)

  if (isPending || recent.length === 0) return null

  return (
    <section className="border-b border-[var(--color-border)] px-2 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-[var(--color-muted-foreground)]">
        <Clock3 className="size-3.5" />
        <span>最近会话</span>
      </div>
      <div className="space-y-0.5">
        {recent.map(session => {
          const active = session.id === currentSessionId
          const title = session.title?.trim() || shortCwd(session.cwd)
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSwitch(session.id)}
              title={`${title}\n${session.cwd}`}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-accent)]',
                active && 'bg-[var(--color-accent)] text-[var(--color-primary)]',
              )}
            >
              <MessageSquareText className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
              <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                {active ? '当前' : relativeTime(session.lastSeenAt)}
              </span>
              <span className="sr-only">{engineDisplayName(session.engine ?? 'claude', session.providerKind)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function shortCwd(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || cwd
}

function relativeTime(epochMs: number): string {
  const elapsed = Math.max(0, Date.now() - epochMs)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(epochMs)
}
