import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Circle, Folder, FolderMinus, FolderPlus, Pencil, Search, Tags, Trash2, X } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { deleteSession, listSessions, renameSession, setSessionGroupApi } from '../api'
import { engineDisplayName, providerHost } from './chatStatus'
import type { ClaudeChatSessionView, Engine } from '../types'

const OLD_GROUP_KEY = 'kai-toolbox:claude-chat-stable:session-groups'
let groupMigrationDone = false

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
/** 未分组分桶键（不会与用户分组名冲突）。 */
const UNGROUPED = '0ungrouped'

/** 工具会话列表：点击切换/续跑，可重命名 / 删除 / 归入自定义分组；selectable 时支持多选并行分屏。 */
export function SessionList({ currentSessionId, onSwitch, selectable, selectedIds, onToggleSelect }: Props) {
  const qc = useQueryClient()
  const { data: sessions = [], isPending } = useQuery({ queryKey: KEY, queryFn: listSessions })

  // 一次性迁移：把旧的本地(localStorage)分组搬到后端，之后分组随会话跨端可见。
  // 安全第一：只有「服务端确认保存成功」的条目才从本地删；失败(如后端还没重启、没有分组接口)的原样留在
  // 本地，等下次进入重试——绝不因为迁移失败而丢掉用户现有分组。
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
          if (!ids.has(id)) continue                 // 会话已不存在：丢弃这条无主映射
          if (alreadyGrouped.has(id)) continue        // 服务端已有分组：无需迁移
          try { await setSessionGroupApi(id, g.trim()) } // 成功 → 不保留
          catch { remaining[id] = g }                  // 失败 → 留着，下次重试（本地不丢）
        }
        if (Object.keys(remaining).length === 0) {
          try { localStorage.removeItem(OLD_GROUP_KEY) } catch { /* ignore */ }
        } else {
          // 还有没迁成功的：把「未成功」的写回本地保住，并允许下次重试（后端重启后即可迁完）
          try { localStorage.setItem(OLD_GROUP_KEY, JSON.stringify(remaining)) } catch { /* ignore */ }
          groupMigrationDone = false
        }
        qc.invalidateQueries({ queryKey: KEY })
      } catch {
        groupMigrationDone = false // 连会话列表都拉不到：整体不动，保留本地，下次再试
      }
    })()
  }, [qc])

  // 现有分组名（来自后端会话数据，去重排序）
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

  const assignGroup = (s: ClaudeChatSessionView) => setGroupPickFor(s)

  const toggleGroup = (name: string) => setCollapsed(prev => {
    const n = new Set(prev)
    if (n.has(name)) n.delete(name); else n.add(name)
    return n
  })

  if (isPending) {
    return <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">加载中…</div>
  }
  if (sessions.length === 0) {
    return <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">还没有会话，点上方「新建」开始</div>
  }

  // 分桶：命名分组按名排序在前，未分组在后
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
    {/* 无任何分组：平铺(与未启用分组时一致，不加 Section 噪音)。有分组：命名分组 + 未分组各成一个带 Header 的 Section。 */}
    {!hasGroups ? (
      <ul className="divide-y">
        {(buckets.get(UNGROUPED) ?? []).map(s => renderRow(s))}
      </ul>
    ) : (
      <div>
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

  /** 一个分组 Section：灰底 + 下分隔线 + 加粗名 + 计数 Badge 的可折叠 Header（VS Code/Cursor 风），下面是会话行。 */
  function renderSection(key: string, label: string, list: ClaudeChatSessionView[], ungrouped: boolean) {
    const open = !collapsed.has(key)
    return (
      <section key={`sec:${key}`}>
        <button
          type="button"
          onClick={() => toggleGroup(key)}
          className="sticky top-0 z-[1] flex w-full items-center gap-1.5 border-y border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-left"
        >
          <ChevronRight className={cn('size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform', open && 'rotate-90')} />
          {ungrouped
            ? <Folder className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            : <Tags className="size-3.5 shrink-0 text-[var(--color-primary)]" />}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-foreground)]">{label}</span>
          <span className="shrink-0 rounded-full bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-muted-foreground)]">{list.length}</span>
        </button>
        {open && (
          <ul className="divide-y">
            {list.map(s => renderRow(s))}
          </ul>
        )}
      </section>
    )
  }

  function renderRow(s: ClaudeChatSessionView) {
    return (
      <li
        key={s.id}
        className={cn('flex items-center gap-2 px-3 py-3', s.id === currentSessionId && 'bg-[var(--color-accent)]')}
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
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSwitch(s.id)} title={`${s.title || shortCwd(s.cwd)}\n${s.cwd}`}>
            <div className="flex items-center gap-2">
              {s.live && <Circle className="size-2 fill-green-500 text-green-500" />}
              <span className="truncate text-sm font-medium">{s.title || shortCwd(s.cwd)}</span>
              {(() => {
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
              onClick={e => { e.stopPropagation(); void assignGroup(s) }}
              aria-label="移动到分组"
              title="移动到分组"
            >
              <Tags className="size-4" />
            </button>
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
    )
  }
}

/** 分组选择器：模糊搜索已有分组、点选、可新建、可移出。回车=精确命中则选中，否则按输入新建。 */
function GroupPicker({ current, all, onPick, onClose }: { current: string; all: string[]; onPick: (g: string | null) => void; onClose: () => void }) {
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
            autoFocus
            value={q}
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

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}
