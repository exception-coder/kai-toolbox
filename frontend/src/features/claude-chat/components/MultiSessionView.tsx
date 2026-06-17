import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionPane } from './SessionPane'
import { agentAccent, agentStatusMeta, engineName, type AgentStatus } from './chatStatus'
import { listSessions } from '../api'
import type { ClaudeChatSessionView } from '../types'

interface Props {
  /** 并行展示的会话 id 列表。 */
  sessionIds: string[]
  /** 退出分屏，回单会话视图。 */
  onExit: () => void
  /** 从分屏移除某个会话块。 */
  onRemove: (sessionId: string) => void
}

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}

function titleOf(meta: ClaudeChatSessionView | undefined, id: string): string {
  return meta?.title?.trim() || (meta ? shortCwd(meta.cwd) : id.slice(0, 8))
}

/**
 * 多会话并行视图：「Agent 列表 + 详情」master-detail。
 * - 顶部 Dashboard 概览：共几个 Agent / 几个运行中 / 几个报错。
 * - 左侧列表：每个 Agent 带状态点 + 标题 + 引擎 + 区分色，点击切换详情；可单独移除。
 * - 右侧详情：仅渲染选中 Agent 的完整可交互界面；其余 Agent 后台保活（各自 WS）并持续上报状态。
 * 该结构从 2 个到 10+ 个会话都能线性扩展，而非并排聊天框塞爆横向空间。
 */
export function MultiSessionView({ sessionIds, onExit, onRemove }: Props) {
  const [activeId, setActiveId] = useState<string | null>(sessionIds[0] ?? null)
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({})

  // 列表变化（移除/进入）后保证 activeId 仍有效
  useEffect(() => {
    if (!activeId || !sessionIds.includes(activeId)) setActiveId(sessionIds[0] ?? null)
  }, [sessionIds, activeId])

  // 子块上报状态：仅在实际变化时写入，避免无谓重渲染
  const setStatus = useCallback((id: string, s: AgentStatus) => {
    setStatuses(prev => {
      const old = prev[id]
      if (old && old.kind === s.kind && old.count === s.count && old.errorText === s.errorText) return prev
      return { ...prev, [id]: s }
    })
  }, [])

  const { data: sessions = [] } = useQuery({ queryKey: ['claude-chat-sessions'], queryFn: listSessions, staleTime: 5000 })
  const metaById = (id: string) => sessions.find(s => s.id === id)

  const runningCount = sessionIds.filter(id => statuses[id]?.kind === 'running').length
  const errorCount = sessionIds.filter(id => statuses[id]?.kind === 'error').length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Dashboard 概览条 */}
      <div className="flex items-center gap-3 border-b bg-[var(--color-muted)] px-3 py-1.5 text-xs">
        <span className="font-semibold">分屏并看</span>
        <span className="text-[var(--color-muted-foreground)]">
          {sessionIds.length} 个 Agent
          {runningCount > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · {runningCount} 运行中</span>}
          {errorCount > 0 && <span className="text-red-600 dark:text-red-400"> · {errorCount} 报错</span>}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={onExit}>
          <X className="size-4" /> 退出分屏
        </Button>
      </div>

      {sessionIds.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          没有选中的会话
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* 左侧 Agent 列表 */}
          <aside className="w-56 shrink-0 overflow-y-auto border-r bg-[var(--color-background)]">
            <ul className="p-1.5">
              {sessionIds.map((id, i) => {
                const accent = agentAccent(i)
                const st = statuses[id] ?? { kind: 'connecting' as const, count: 0 }
                const sm = agentStatusMeta(st.kind)
                const meta = metaById(id)
                const on = id === activeId
                return (
                  <li key={id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveId(id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(id) } }}
                      style={{ borderLeftColor: accent, backgroundColor: on ? `${accent}1f` : undefined }}
                      className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-md border-l-[3px] px-2 py-2 ${on ? '' : 'hover:bg-[var(--color-accent)]'}`}
                    >
                      <span className={`size-2.5 shrink-0 rounded-full ${sm.dot}${sm.pulse ? ' animate-pulse' : ''}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" title={meta?.cwd}>{titleOf(meta, id)}</div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
                          <span>{engineName(meta?.engine ?? 'claude')}</span>
                          <span>·</span>
                          <span className={sm.text}>{sm.label}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onRemove(id) }}
                        aria-label="移除此 Agent"
                        className="shrink-0 rounded p-0.5 text-[var(--color-muted-foreground)] opacity-0 hover:bg-[var(--color-background)] hover:text-[var(--color-destructive)] group-hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* 右侧详情：所有块都挂载（保活 + 上报状态），仅 active 渲染重型 UI */}
          <section className="min-h-0 flex-1">
            {sessionIds.map((id, i) => (
              <SessionPane
                key={id}
                sessionId={id}
                active={id === activeId}
                accent={agentAccent(i)}
                onStatus={s => setStatus(id, s)}
              />
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
