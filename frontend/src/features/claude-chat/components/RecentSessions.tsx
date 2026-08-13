import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock3, Link2, Loader2, LockKeyhole, Pencil, Star, Tags, Trash2, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deleteSession, listSessions, renameSession, setSessionFavorite, setSessionGroupApi } from '../api'
import { engineDisplayName } from './chatStatus'
import { getSessionsByDevSessions } from '@/features/prd-clarify/api'
import { SessionActivityBar } from './SessionActivityBar'
import { EngineIcon } from './EngineIcon'
import { SessionGroupPicker } from './SessionList'
import { CopySessionIdButton } from './CopySessionIdButton'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { ClaudeChatSessionView } from '../types'
import { useSessionPlanState } from '../hooks/useSessionPlanState'
import { isSessionStatusVisible, useVisibleSessionStatuses } from '../lib/sessionStatusFilter'
import { isVibeCodingSession } from '../lib/sessionScope'

interface Props {
  currentSessionId: string | null
  /** hintRunning：目标会话此刻是否仍在跑（status=RUNNING 且 live=挂在活跃 sidecar 上）——
   *  切过去时用它乐观点亮"中断"按钮，不用等 Ready 校正（ready 只会关不会开，见 switchTo 里的说明）。 */
  onSwitch: (sessionId: string, hintRunning?: boolean) => void
  limit?: number
}

const SESSION_QUERY_KEY = ['claude-chat-sessions']

/**
 * 最近会话快速入口：显示最近 N 条会话，风格与 SessionList 保持一致。
 * 视觉层级：Section 标题（一级）→ 会话行（二级）→ 时间元信息（三级）。
 * 双击标题可直接改名（与 SessionList / 顶栏标题一致的交互）。
 */
export function RecentSessions({ currentSessionId, onSwitch, limit = 12 }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { busyId: planBusyId, expire: expirePlan, unlock: unlockPlan } = useSessionPlanState()
  const { data: sessions = [], isPending } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: listSessions,
    refetchInterval: 3_000,
  })
  const visibleStatuses = useVisibleSessionStatuses()
  const recentCandidates = useMemo(() => sessions.filter(isVibeCodingSession), [sessions])
  const recent = recentCandidates
    .filter(session => isSessionStatusVisible(session, visibleStatuses))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, limit)
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.lastSeenAt - a.lastSeenAt)

  // 同 SessionList：批量查一次这几条会话里哪些绑了 PRD，行首标个小图标，不用点开才知道。
  const recentIdsKey = useMemo(() => [...recent.map(s => s.id)].sort().join(','), [recent])
  const { data: prdLinks = {} } = useQuery({
    queryKey: ['claude-chat-sessions-prd-links', recentIdsKey],
    queryFn: () => getSessionsByDevSessions(recent.map(s => s.id)),
    enabled: recent.length > 0,
    staleTime: 60_000,
  })

  // 双击改名：本地记录正在编辑的会话 id + 草稿文本，提交后写回并刷新列表。
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [groupPickFor, setGroupPickFor] = useState<ClaudeChatSessionView | null>(null)
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null)
  const allGroupPaths = useMemo(() => recentCandidates
    .map(session => ({
      project: (session.group ?? '').trim(),
      requirement: (session.subgroup ?? '').trim(),
    }))
    .filter(path => path.project), [recentCandidates])
  const startEdit = (id: string, cur: string) => { setEditingId(id); setDraft(cur) }
  const commitEdit = async (id: string) => {
    const t = draft.trim()
    setEditingId(null)
    if (t) {
      await renameSession(id, t)
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    }
  }

  const applyGroup = async (id: string, project: string | null, requirement?: string | null) => {
    await setSessionGroupApi(id, project, requirement)
    await qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
  }

  const toggleFavorite = async (session: ClaudeChatSessionView) => {
    if (favoriteBusyId) return
    setFavoriteBusyId(session.id)
    try {
      await setSessionFavorite(session.id, !session.favorite)
      await qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    } finally {
      setFavoriteBusyId(null)
    }
  }

  const remove = async (session: ClaudeChatSessionView) => {
    const title = session.title?.trim() || shortCwd(session.cwd)
    const ok = await confirm({
      title: '删除会话？',
      description: `会话“${title}”删除后无法恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteSession(session.id)
    await qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
  }

  if (isPending || recentCandidates.length === 0) return null

  return (
    <>
    <section className="mb-2 border-b border-[var(--color-border)]/60 pb-2">
      {/* Section 标题：与 SessionList 分组 header 对齐 */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Clock3 className="size-3 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          最近会话
        </span>
      </div>

      {recent.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-[var(--color-muted-foreground)]">当前状态筛选下没有最近会话</p>
      ) : <ul className="max-h-[55vh] overflow-y-auto overscroll-contain">
        {recent.map(session => {
          const isActive = session.id === currentSessionId
          const title = session.title?.trim() || shortCwd(session.cwd)
          const engineLabel = engineDisplayName(session.engine ?? 'claude', session.providerKind)
          const isEditing = editingId === session.id
          const linkedPrd = prdLinks[session.id]
          const isRunning = session.status === 'RUNNING' && session.live

          return (
            <li
              key={session.id}
              className={cn(
                'group relative isolate transition-colors duration-100',
                session.planExpired
                  ? 'bg-[var(--color-muted)]/60 hover:bg-[var(--color-muted)]/80'
                  : isActive ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-accent)]',
              )}
            >
              {isRunning && <SessionActivityBar />}
              {/* Left Accent Bar：与 SessionList 完全一致 */}
              <div className={cn(
                'absolute inset-y-0 left-0 z-20 w-[3px] rounded-r-sm transition-colors duration-100',
                session.planExpired
                  ? 'bg-[var(--color-muted-foreground)]/45'
                  : isActive ? 'bg-[var(--color-primary)]' : 'bg-transparent group-hover:bg-[var(--color-border)]',
              )} />

              {isEditing ? (
                <div className="relative z-10 flex min-h-[44px] w-full items-center gap-2 py-2 pl-5 pr-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => void commitEdit(session.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); void commitEdit(session.id) }
                      else if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="min-w-0 flex-1 rounded border border-[var(--color-primary)] bg-[var(--color-background)] px-1.5 py-0.5 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => void commitEdit(session.id)}
                    aria-label="确认重命名"
                    className="rounded p-1.5 text-[var(--color-primary)]"
                  >
                    <Check className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSwitch(session.id, session.status === 'RUNNING' && session.live)}
                  onDoubleClick={e => { e.stopPropagation(); startEdit(session.id, title) }}
                  title={`${title}\n${session.cwd}\n（双击重命名）`}
                  className="relative z-10 min-h-[52px] w-full py-2 pl-5 pr-2 text-left"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {session.live
                      ? <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 ring-[2.5px] ring-emerald-500/20" />
                      : <EngineIcon engine={session.engine || 'claude'} thirdParty={session.providerKind === 'thirdParty'} className="size-3" muted />}
                    <span className={cn(
                      'min-w-0 flex-1 truncate text-sm leading-snug',
                      session.planExpired
                        ? 'font-medium text-[var(--color-muted-foreground)]'
                        : isActive
                        ? 'font-semibold text-[var(--color-primary)]'
                        : 'font-medium text-[var(--color-foreground)]',
                    )}>
                      {title}
                    </span>
                    {session.favorite && (
                      <Star
                        aria-label="已收藏"
                        className="size-3 shrink-0 fill-amber-400 text-amber-500"
                      />
                    )}
                    {linkedPrd && (
                      <span
                        title={`已关联 PRD：${linkedPrd.title || '（未命名）'}`}
                        className="shrink-0 text-[var(--color-primary)] opacity-70"
                      >
                        <Link2 className="size-3" />
                      </span>
                    )}
                  </div>
                  <div className={cn(
                    'mt-0.5 flex min-w-0 items-center gap-1.5 pr-32 text-[11px] leading-snug',
                    isActive ? 'text-[var(--color-primary)]/60' : 'text-[var(--color-muted-foreground)] opacity-60',
                  )}>
                    <span className="shrink-0 rounded bg-[var(--color-muted)] px-1 py-0.5 text-[10px]">{engineLabel}</span>
                    {session.planExpired && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 opacity-100 dark:bg-amber-950 dark:text-amber-300">
                        <LockKeyhole className="size-2.5" />规划已过期
                      </span>
                    )}
                    <span className="truncate tabular-nums">{isActive ? '当前' : relativeTime(session.lastSeenAt)}</span>
                  </div>
                </button>
              )}

              {!isEditing && (
                <div className={cn(
                  'absolute bottom-0 right-0 z-20 flex h-7 items-center pl-2 pr-1',
                  'opacity-100 transition-opacity duration-100 sm:opacity-0 sm:group-hover:opacity-100',
                  session.planExpired
                    ? 'bg-[var(--color-muted)]'
                    : isActive ? 'bg-[var(--color-primary)]/10' : 'bg-[var(--color-accent)]',
                )}>
                  <button
                    type="button"
                    disabled={favoriteBusyId !== null}
                    onClick={event => {
                      event.stopPropagation()
                      void toggleFavorite(session)
                    }}
                    aria-label={session.favorite ? '取消收藏会话' : '收藏会话'}
                    title={session.favorite ? '取消收藏' : '收藏会话'}
                    className={cn(
                      'rounded p-1.5 disabled:opacity-40',
                      session.favorite
                        ? 'text-amber-500 hover:text-amber-600'
                        : 'text-[var(--color-muted-foreground)] hover:text-amber-500',
                    )}
                  >
                    {favoriteBusyId === session.id
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <Star className={cn('size-3.5', session.favorite && 'fill-current')} />}
                  </button>
                  <CopySessionIdButton sessionId={session.id} />
                  <button
                    type="button"
                    disabled={planBusyId === session.id || isRunning}
                    onClick={event => {
                      event.stopPropagation()
                      void (session.planExpired ? unlockPlan(session) : expirePlan(session))
                    }}
                    aria-label={session.planExpired ? '解锁过期规划' : '标记规划过期'}
                    title={isRunning ? '运行中的会话需先中断' : session.planExpired ? '解锁过期规划' : '标记规划过期'}
                    className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-amber-600 disabled:opacity-40"
                  >
                    {session.planExpired ? <Unlock className="size-3.5" /> : <LockKeyhole className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); setGroupPickFor(session) }}
                    aria-label="设置系统和需求分组"
                    title="设置系统和需求分组"
                    className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  >
                    <Tags className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); startEdit(session.id, title) }}
                    aria-label="重命名会话"
                    title="重命名会话"
                    className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); void remove(session) }}
                    aria-label="删除会话"
                    title="删除会话"
                    className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>}
    </section>
    {groupPickFor && (
      <SessionGroupPicker
        currentProject={(groupPickFor.group ?? '').trim()}
        currentRequirement={(groupPickFor.subgroup ?? '').trim()}
        all={allGroupPaths}
        onPick={(project, requirement) => {
          void applyGroup(groupPickFor.id, project, requirement)
          setGroupPickFor(null)
        }}
        onClose={() => setGroupPickFor(null)}
      />
    )}
    </>
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
