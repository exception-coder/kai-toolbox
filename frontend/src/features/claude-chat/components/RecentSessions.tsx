import { useQuery } from '@tanstack/react-query'
import { Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listSessions } from '../api'
import { engineDisplayName } from './chatStatus'

interface Props {
  currentSessionId: string | null
  onSwitch: (sessionId: string) => void
  limit?: number
}

const SESSION_QUERY_KEY = ['claude-chat-sessions']

/**
 * 最近会话快速入口：显示最近 N 条会话，风格与 SessionList 保持一致。
 * 视觉层级：Section 标题（一级）→ 会话行（二级）→ 时间元信息（三级）。
 */
export function RecentSessions({ currentSessionId, onSwitch, limit = 5 }: Props) {
  const { data: sessions = [], isPending } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: listSessions })
  const recent = [...sessions]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, limit)

  if (isPending || recent.length === 0) return null

  return (
    <section className="mb-2 border-b border-[var(--color-border)]/60 pb-2">
      {/* Section 标题：与 SessionList 分组 header 对齐 */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Clock3 className="size-3 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          最近会话
        </span>
      </div>

      <ul>
        {recent.map(session => {
          const isActive = session.id === currentSessionId
          const title = session.title?.trim() || shortCwd(session.cwd)
          const engineLabel = engineDisplayName(session.engine ?? 'claude', session.providerKind)

          return (
            <li
              key={session.id}
              className={cn(
                'group relative transition-colors duration-100',
                isActive ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-accent)]',
              )}
            >
              {/* Left Accent Bar：与 SessionList 完全一致 */}
              <div className={cn(
                'absolute inset-y-0 left-0 w-[3px] rounded-r-sm transition-colors duration-100',
                isActive ? 'bg-[var(--color-primary)]' : 'bg-transparent group-hover:bg-[var(--color-border)]',
              )} />

              <button
                type="button"
                onClick={() => onSwitch(session.id)}
                title={`${title}\n${session.cwd}`}
                className="flex min-h-[40px] w-full items-center gap-2 pl-5 pr-3 py-2 text-left"
              >
                {/* 标题（主视觉层级） */}
                <span className={cn(
                  'min-w-0 flex-1 truncate text-sm leading-snug',
                  isActive
                    ? 'font-semibold text-[var(--color-primary)]'
                    : 'font-medium text-[var(--color-foreground)]',
                )}>
                  {title}
                </span>

                {/* 右侧：当前状态 / 相对时间（三级视觉权重） */}
                <span className={cn(
                  'shrink-0 text-[11px] tabular-nums',
                  isActive
                    ? 'font-medium text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] opacity-60',
                )}>
                  {isActive ? '当前' : relativeTime(session.lastSeenAt)}
                </span>

                <span className="sr-only">{engineLabel}</span>
              </button>
            </li>
          )
        })}
      </ul>
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
  if (minutes < 60) return `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(epochMs)
}
