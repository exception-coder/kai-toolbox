import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Circle, Pencil, Trash2 } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { deleteSession, listSessions, renameSession } from '../api'
import { engineDisplayName, providerHost } from './chatStatus'
import type { Engine } from '../types'

interface Props {
  currentSessionId: string | null
  onSwitch: (sessionId: string) => void
  /** 多选模式：每行前置勾选框，点击只切选中、不触发 onSwitch。 */
  selectable?: boolean
  /** 已选中的会话 id 集合（仅 selectable 时使用）。 */
  selectedIds?: Set<string>
  /** 切换某会话选中态（仅 selectable 时使用）。 */
  onToggleSelect?: (sessionId: string) => void
}

const KEY = ['claude-chat-sessions']

/** 工具会话列表：点击切换/续跑，可重命名 / 删除；selectable 时支持多选并行分屏。 */
export function SessionList({ currentSessionId, onSwitch, selectable, selectedIds, onToggleSelect }: Props) {
  const qc = useQueryClient()
  const { data: sessions = [], isPending } = useQuery({
    queryKey: KEY,
    queryFn: listSessions,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const remove = async (id: string) => {
    await deleteSession(id)
    qc.invalidateQueries({ queryKey: KEY })
  }

  const startEdit = (id: string, cur: string) => {
    setEditingId(id)
    setDraft(cur)
  }

  const commitEdit = async (id: string) => {
    const t = draft.trim()
    setEditingId(null)
    if (t) {
      await renameSession(id, t)
      qc.invalidateQueries({ queryKey: KEY })
    }
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
          {selectable && (
            <input
              type="checkbox"
              className="size-4 shrink-0"
              checked={selectedIds?.has(s.id) ?? false}
              onChange={() => onToggleSelect?.(s.id)}
              aria-label={`选择会话 ${s.title || shortCwd(s.cwd)}`}
            />
          )}
          {editingId === s.id ? (
            <input
              autoFocus
              className="min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void commitEdit(s.id) }
                else if (e.key === 'Escape') setEditingId(null)
              }}
              onBlur={() => void commitEdit(s.id)}
            />
          ) : (
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSwitch(s.id)}>
              <div className="flex items-center gap-2">
                {s.live && <Circle className="size-2 fill-green-500 text-green-500" />}
                <span className="truncate text-sm font-medium">{s.title || shortCwd(s.cwd)}</span>
                {(() => {
                  // 去重：本会话用过的 agent 集合（切回曾用引擎是 resume 续接，不是新增）。
                  // 兼容旧数据——历史行的 engines 可能是 claude,codex,claude,… 流水，这里按首次出现序压成集合。
                  const raw = (s.engines && s.engines.trim() ? s.engines.split(',') : [s.engine || 'claude'])
                    .map(e => e.trim()).filter(Boolean)
                  const order = [...new Set(raw)] as Engine[]
                  const thirdPartyClaude = s.providerKind === 'thirdParty'
                  const host = providerHost(s.providerBaseUrl)
                  const label = order
                    .map(e => engineDisplayName(e, e === 'claude' && thirdPartyClaude ? 'thirdParty' : 'official'))
                    .join(' · ')
                  const multi = order.length > 1
                  return (
                    <span
                      title={thirdPartyClaude
                        ? `Claude 使用第三方网关：${host ?? s.providerBaseUrl ?? '未知'}${multi ? `；本会话用过这些 agent：${label}` : ''}`
                        : multi ? `本会话用过这些 agent（切回为续接，非新建）：${label}` : undefined}
                      className={cn(
                        'shrink-0 rounded px-1 text-[10px]',
                        thirdPartyClaude
                          ? 'border border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : multi
                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                            : s.engine === 'codex'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200'
                              : s.engine === 'gemini'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200'
                                : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                      )}
                    >
                      {label}
                    </span>
                  )
                })()}
              </div>
              <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                {s.cwd} · {formatDate(s.lastSeenAt)}
              </div>
            </button>
          )}
          {editingId === s.id ? (
            <button
              type="button"
              className="rounded-md p-2 text-[var(--color-primary)]"
              onMouseDown={e => e.preventDefault()}
              onClick={() => void commitEdit(s.id)}
              aria-label="确认重命名"
            >
              <Check className="size-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="rounded-md p-2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                onClick={e => { e.stopPropagation(); startEdit(s.id, s.title || shortCwd(s.cwd)) }}
                aria-label="重命名会话"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                onClick={e => { e.stopPropagation(); void remove(s.id) }}
                aria-label="删除会话"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}
