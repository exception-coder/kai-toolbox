import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Check, ChevronRight, Code2, Folder, FolderMinus, FolderPlus, Pencil, Search, Sparkles, Tags, Trash2, X, Zap } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { deleteSession, listSessions, renameSession, setSessionGroupApi } from '../api'
import { engineDisplayName, providerHost } from './chatStatus'
import type { ClaudeChatSessionView, Engine } from '../types'

const OLD_GROUP_KEY = 'kai-toolbox:claude-chat:session-groups'
let groupMigrationDone = false

interface Props {
  currentSessionId: string | null
  /** hintRunning：目标会话此刻是否仍在跑（status=RUNNING 且 live=挂在活跃 sidecar 上）——
   *  切过去时用它乐观点亮"中断"按钮，不用等 Ready 校正（ready 只会关不会开，见 switchTo 里的说明）。 */
  onSwitch: (sessionId: string, hintRunning?: boolean) => void
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (sessionId: string) => void
}

const KEY = ['claude-chat-sessions']
const UNGROUPED = ' ungrouped'

export function SessionList({ currentSessionId, onSwitch, selectable, selectedIds, onToggleSelect }: Props) {
  const qc = useQueryClient()
  const { data: sessions = [], isPending } = useQuery({ queryKey: KEY, queryFn: listSessions })

  useEffect(() => {
    if (groupMigrationDone) return
    let raw: string | null = null
    try { raw = localStorage.getItem(OLD_GROUP_KEY) } catch { raw = null }
    if (!raw) { groupMigrationDone = true; return }
    groupMigrationDone = true
    let map: Record<string, string> = {}
    try { map = JSON.parse(raw) as Record<string, string> } catch { try { localStorage.removeItem(OLD_GROUP_KEY) } catch { /* ignore */ }; return }
    const entries = Object.entries(map).filter(([, g]) => g && g.trim())
    if (entries.length === 0) { try { localStorage.removeItem(OLD_GROUP_KEY) } catch { /* ignore */ }; return }
    void (async () => {
      try {
        const server = await listSessions()
        const ids = new Set(server.map(s => s.id))
        const alreadyGrouped = new Set(server.filter(s => (s.group ?? '').trim()).map(s => s.id))
        const remaining: Record<string, string> = {}
        for (const [id, g] of entries) {
          if (!ids.has(id)) continue
          if (alreadyGrouped.has(id)) continue
          try { await setSessionGroupApi(id, g.trim()) }
          catch { remaining[id] = g }
        }
        if (Object.keys(remaining).length === 0) {
          try { localStorage.removeItem(OLD_GROUP_KEY) } catch { /* ignore */ }
        } else {
          try { localStorage.setItem(OLD_GROUP_KEY, JSON.stringify(remaining)) } catch { /* ignore */ }
          groupMigrationDone = false
        }
        qc.invalidateQueries({ queryKey: KEY })
      } catch {
        groupMigrationDone = false
      }
    })()
  }, [qc])

  const allGroups = useMemo(
    () => [...new Set(sessions.map(s => (s.group ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [sessions],
  )
  const applyGroup = async (id: string, g: string | null) => {
    await setSessionGroupApi(id, g)
    qc.invalidateQueries({ queryKey: KEY })
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [groupPickFor, setGroupPickFor] = useState<ClaudeChatSessionView | null>(null)

  const remove = async (id: string) => {
    await deleteSession(id)
    qc.invalidateQueries({ queryKey: KEY })
  }

  const startEdit = (id: string, cur: string) => { setEditingId(id); setDraft(cur) }

  const commitEdit = async (id: string) => {
    const t = draft.trim()
    setEditingId(null)
    if (t) {
      await renameSession(id, t)
      qc.invalidateQueries({ queryKey: KEY })
    }
  }

  const assignGroup = (s: ClaudeChatSessionView) => setGroupPickFor(s)

  const toggleGroup = (name: string) => setCollapsed(prev => {
    const n = new Set(prev)
    if (n.has(name)) n.delete(name); else n.add(name)
    return n
  })

  if (isPending) return <div className="px-4 py-4 text-sm text-[var(--color-muted-foreground)]">加载中…</div>
  if (sessions.length === 0) return <div className="px-4 py-4 text-sm text-[var(--color-muted-foreground)]">还没有会话，点上方「新建」开始</div>

  const buckets = new Map<string, ClaudeChatSessionView[]>()
  for (const s of sessions) {
    const g = (s.group ?? '').trim() || UNGROUPED
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(s)
  }
  const namedGroups = [...buckets.keys()].filter(g => g !== UNGROUPED).sort((a, b) => a.localeCompare(b))
  const hasGroups = namedGroups.length > 0

  return (
    <>
      {!hasGroups ? (
        <ul className="py-1">
          {(buckets.get(UNGROUPED) ?? []).map(s => renderRow(s, false))}
        </ul>
      ) : (
        <div className="py-1">
          {namedGroups.map(name => renderSection(name, name, buckets.get(name)!, false))}
          {buckets.has(UNGROUPED) && renderSection(UNGROUPED, '未分组', buckets.get(UNGROUPED)!, true)}
        </div>
      )}
      {groupPickFor && (
        <GroupPicker
          current={(groupPickFor.group ?? '').trim()}
          all={allGroups}
          onPick={g => { void applyGroup(groupPickFor.id, g); setGroupPickFor(null) }}
          onClose={() => setGroupPickFor(null)}
        />
      )}
    </>
  )

  // ─── Section ───────────────────────────────────────────────────────────────

  function renderSection(key: string, label: string, list: ClaudeChatSessionView[], ungrouped: boolean) {
    const open = !collapsed.has(key)
    return (
      <section key={`sec:${key}`} className="mt-3 mb-1">
        {/* Section header：明显的背景 + 下边框，与 Item 形成真正的层级区分 */}
        <button
          type="button"
          onClick={() => toggleGroup(key)}
          className="sticky top-0 z-[1] flex w-full items-center gap-1.5 border-b border-[var(--color-border)]/60 bg-[var(--color-muted)]/60 px-3 py-2.5 text-left"
        >
          <ChevronRight className={cn('size-3 shrink-0 text-[var(--color-muted-foreground)] transition-transform duration-150', open && 'rotate-90')} />
          {ungrouped
            ? <Folder className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            : <Tags className="size-3.5 shrink-0 text-[var(--color-primary)]" />}
          {/* text-xs + foreground/70：比 Item 标题弱，但比之前的 muted 更有存在感 */}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-[var(--color-foreground)]/70">
            {label}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
            {list.length}
          </span>
        </button>
        {open && (
          <ul className="pt-0.5">
            {list.map(s => renderRow(s, true))}
          </ul>
        )}
      </section>
    )
  }

  // ─── Row ───────────────────────────────────────────────────────────────────

  function renderRow(s: ClaudeChatSessionView, inGroup: boolean) {
    const isActive = s.id === currentSessionId

    const engineBadge = (() => {
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
          title={
            thirdPartyClaude
              ? `Claude 使用第三方网关：${host ?? s.providerBaseUrl ?? '未知'}${multi ? `；本会话用过这些 agent：${label}` : ''}`
              : multi ? `本会话用过这些 agent（切回为续接，非新建）：${label}` : undefined
          }
          className={cn(
            'shrink-0 rounded px-1 py-0.5 text-[10px] opacity-50',
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
    })()

    return (
      <li
        key={s.id}
        className={cn(
          'group relative flex items-center gap-1 transition-colors duration-100',
          isActive ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-accent)]',
        )}
      >
        {/* Left Accent Bar：4px 加宽，选中态更醒目 */}
        <div className={cn(
          'absolute inset-y-0 left-0 w-[4px] rounded-r-sm transition-colors duration-100',
          isActive ? 'bg-[var(--color-primary)]' : 'bg-transparent group-hover:bg-[var(--color-border)]',
        )} />

        {selectable && (
          <input
            type="checkbox"
            className="ml-4 size-4 shrink-0"
            checked={selectedIds?.has(s.id) ?? false}
            onChange={() => onToggleSelect?.(s.id)}
            aria-label={`选择会话 ${s.title || shortCwd(s.cwd)}`}
          />
        )}

        {editingId === s.id ? (
          <input
            autoFocus
            className={cn('min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm', inGroup ? 'ml-8' : 'ml-5')}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void commitEdit(s.id) }
              else if (e.key === 'Escape') setEditingId(null)
            }}
            onBlur={() => void commitEdit(s.id)}
          />
        ) : (
          <button
            type="button"
            className={cn(
              // pr-16 给操作按钮预留隐形空间（按钮绝对定位，不占布局，但文字不能延伸进按钮区）
              'min-h-[44px] min-w-0 flex-1 py-2.5 pr-2 text-left',
              inGroup ? 'pl-8' : 'pl-5',
            )}
            onClick={() => onSwitch(s.id, s.status === 'RUNNING' && s.live)}
            onDoubleClick={e => { e.stopPropagation(); startEdit(s.id, s.title || shortCwd(s.cwd)) }}
            title={`${s.title || shortCwd(s.cwd)}\n${s.cwd}\n（双击重命名）`}
          >
            {/* Line 1：只放 icon + 标题，Badge 移走 → 标题拿到最大宽度 */}
            <div className="flex items-center gap-1.5">
              {s.live
                ? <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 ring-[2.5px] ring-emerald-500/20" />
                : <EngineIcon engine={s.engine || 'claude'} thirdParty={s.providerKind === 'thirdParty'} />
              }
              <span className={cn(
                'min-w-0 flex-1 truncate text-sm leading-snug',
                isActive
                  ? 'font-semibold text-[var(--color-primary)]'
                  : 'font-medium text-[var(--color-foreground)]',
              )}>
                {s.title || shortCwd(s.cwd)}
              </span>
            </div>
            {/* Line 2：Badge（从 Line 1 移来）+ 时间 */}
            <div className={cn(
              'mt-0.5 flex items-center gap-1.5 text-[11px] leading-snug',
              isActive
                ? 'text-[var(--color-primary)]/60'
                : 'text-[var(--color-muted-foreground)] opacity-60',
            )}>
              {engineBadge}
              <span className="tabular-nums">{formatDate(s.lastSeenAt)}</span>
            </div>
          </button>
        )}

        {/* Actions：绝对定位，不占布局宽度，hover 时叠加显示 */}
        {editingId === s.id ? (
          <button
            type="button"
            className="mr-1 rounded p-1.5 text-[var(--color-primary)]"
            onMouseDown={e => e.preventDefault()}
            onClick={() => void commitEdit(s.id)}
            aria-label="确认重命名"
          >
            <Check className="size-3.5" />
          </button>
        ) : (
          <div
            className={cn(
              // 绝对定位贴右边，同行垂直居中；背景色与行状态一致，遮挡身后的文字
              'absolute inset-y-0 right-0 flex items-center pl-2 pr-1',
              'opacity-0 transition-opacity duration-100 group-hover:opacity-100',
              isActive ? 'bg-[var(--color-primary)]/10' : 'bg-[var(--color-accent)]',
            )}
          >
            <button
              type="button"
              className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              onClick={e => { e.stopPropagation(); assignGroup(s) }}
              aria-label="移动到分组"
              title="移动到分组"
            >
              <Tags className="size-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              onClick={e => { e.stopPropagation(); startEdit(s.id, s.title || shortCwd(s.cwd)) }}
              aria-label="重命名会话"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
              onClick={e => { e.stopPropagation(); void remove(s.id) }}
              aria-label="删除会话"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </li>
    )
  }
}

// ─── GroupPicker ─────────────────────────────────────────────────────────────

function GroupPicker({ current, all, onPick, onClose }: {
  current: string; all: string[]
  onPick: (g: string | null) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const filtered = query ? all.filter(g => g.toLowerCase().includes(query)) : all
  const exact = all.some(g => g.toLowerCase() === query)

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-24" onClick={onClose} role="dialog" aria-label="移动到分组">
      <div className="w-72 rounded-xl border bg-[var(--color-popover)] p-3 text-[var(--color-popover-foreground)] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Tags className="size-4 text-[var(--color-primary)]" />移动到分组
          <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"><X className="size-4" /></button>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border bg-[var(--color-background)] px-2">
          <Search className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
          <input
            autoFocus value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { onClose(); return }
              if (e.key !== 'Enter') return
              e.preventDefault()
              const qq = q.trim()
              const exactMatch = all.find(g => g.toLowerCase() === qq.toLowerCase())
              if (exactMatch) onPick(exactMatch)
              else if (qq) onPick(qq)
              else if (filtered.length === 1) onPick(filtered[0])
            }}
            placeholder="搜索或输入新分组名…"
            className="h-8 w-full bg-transparent text-sm focus-visible:outline-none"
          />
        </div>
        <ul className="mt-2 max-h-56 overflow-y-auto">
          {q.trim() && !exact && (
            <li>
              <button type="button" onClick={() => onPick(q.trim())} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--color-muted)]">
                <FolderPlus className="size-4 text-[var(--color-primary)]" />新建「{q.trim()}」
              </button>
            </li>
          )}
          {filtered.map(g => (
            <li key={g}>
              <button type="button" onClick={() => onPick(g)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--color-muted)]">
                <Tags className="size-4 text-[var(--color-muted-foreground)]" />
                <span className="min-w-0 flex-1 truncate">{g}</span>
                {g === current && <Check className="size-4 shrink-0 text-[var(--color-primary)]" />}
              </button>
            </li>
          ))}
          {!filtered.length && !q.trim() && (
            <li className="px-2 py-2 text-xs text-[var(--color-muted-foreground)]">还没有分组，输入名字即可新建。</li>
          )}
          {current && (
            <li className="mt-1 border-t pt-1">
              <button type="button" onClick={() => onPick(null)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]">
                <FolderMinus className="size-4" />移出分组（当前：{current}）
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

/**
 * Engine 类型图标：让用户扫一眼就能辨别会话引擎，不需要读文字。
 * 尺寸 size-3（12px）+ opacity-50，保持低视觉权重，不抢标题焦点。
 */
function EngineIcon({ engine, thirdParty }: { engine: string; thirdParty: boolean }) {
  if (thirdParty) {
    return <Zap className="size-3 shrink-0 opacity-50 text-amber-500" />
  }
  switch (engine) {
    case 'codex':
      return <Code2 className="size-3 shrink-0 opacity-50 text-violet-500" />
    case 'gemini':
    case 'opencode':
      return <Sparkles className="size-3 shrink-0 opacity-50 text-sky-500" />
    default:
      return <Bot className="size-3 shrink-0 opacity-40 text-[var(--color-muted-foreground)]" />
  }
}

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}
