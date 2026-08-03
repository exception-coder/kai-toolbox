import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Filter, Folder, FolderMinus, FolderPlus, Link2, Pencil, Search, Tags, Trash2, X } from 'lucide-react'
import { EngineIcon } from './EngineIcon'
import { cn, formatDate } from '@/lib/utils'
import { deleteSession, listSessions, renameSession, setSessionGroupApi } from '../api'
import { engineDisplayName, providerHost } from './chatStatus'
import type { ClaudeChatSessionView, Engine } from '../types'
import { getSessionsByDevSessions } from '@/features/prd-clarify/api'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Combobox } from '@/components/ui/combobox'
import { SessionActivityBar } from './SessionActivityBar'

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
  const confirm = useConfirm()
  const { data: sessions = [], isPending } = useQuery({
    queryKey: KEY,
    queryFn: listSessions,
    refetchInterval: 3_000,
  })

  // 批量查一次"这些会话里哪些绑了 PRD"，给行首标个小图标——不然只能点进每个会话的顶栏才知道
  // （用户原话："不然不知道哪些绑定了必须要点开"）。key 用排序后的 id 拼接，会话集合不变就不重查。
  const sessionIdsKey = useMemo(() => [...sessions.map(s => s.id)].sort().join(','), [sessions])
  const { data: prdLinks = {} } = useQuery({
    queryKey: ['claude-chat-sessions-prd-links', sessionIdsKey],
    queryFn: () => getSessionsByDevSessions(sessions.map(s => s.id)),
    enabled: sessions.length > 0,
    staleTime: 60_000,
  })

  // 会话筛选：按分组（多选）+ 是否关联 PRD。filterGroups 里用 UNGROUPED 哨兵值表示"未分组"，
  // 跟下面分桶用的 UNGROUPED key 复用同一套语义，不用另开一套常量。空数组 = 不筛分组（全部）。
  const [filterGroups, setFilterGroups] = useState<string[]>([])
  const [groupFilterOpen, setGroupFilterOpen] = useState(false)
  const [filterPrd, setFilterPrd] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [aliasQuery, setAliasQuery] = useState('')
  const normalizedAliasQuery = aliasQuery.trim().toLocaleLowerCase()
  const filterActive = filterGroups.length > 0 || filterPrd !== 'all' || !!normalizedAliasQuery
  const clearFilter = () => { setFilterGroups([]); setFilterPrd('all'); setAliasQuery('') }
  const toggleFilterGroup = (g: string) => setFilterGroups(prev =>
    prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  const filteredSessions = useMemo(() => sessions.filter(s => {
    if (normalizedAliasQuery && !(s.title ?? '').toLocaleLowerCase().includes(normalizedAliasQuery)) return false
    if (filterGroups.length > 0) {
      const g = (s.group ?? '').trim() || UNGROUPED
      if (!filterGroups.includes(g)) return false
    }
    if (filterPrd === 'linked' && !prdLinks[s.id]) return false
    if (filterPrd === 'unlinked' && prdLinks[s.id]) return false
    return true
  }), [sessions, normalizedAliasQuery, filterGroups, filterPrd, prdLinks])

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
  const allGroupPaths = useMemo(() => sessions
    .map(s => ({ project: (s.group ?? '').trim(), requirement: (s.subgroup ?? '').trim() }))
    .filter(x => x.project), [sessions])
  const applyGroup = async (id: string, project: string | null, requirement?: string | null) => {
    await setSessionGroupApi(id, project, requirement)
    qc.invalidateQueries({ queryKey: KEY })
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [groupPickFor, setGroupPickFor] = useState<ClaudeChatSessionView | null>(null)

  const remove = async (session: ClaudeChatSessionView) => {
    const ok = await confirm({
      title: '删除会话？',
      description: `会话“${session.title || shortCwd(session.cwd)}”删除后无法恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteSession(session.id)
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

  const buckets = new Map<string, Map<string, ClaudeChatSessionView[]>>()
  for (const s of filteredSessions) {
    const project = (s.group ?? '').trim() || UNGROUPED
    const requirement = (s.subgroup ?? '').trim() || UNGROUPED
    if (!buckets.has(project)) buckets.set(project, new Map())
    const requirements = buckets.get(project)!
    if (!requirements.has(requirement)) requirements.set(requirement, [])
    requirements.get(requirement)!.push(s)
  }
  const namedGroups = [...buckets.keys()].filter(g => g !== UNGROUPED).sort((a, b) => a.localeCompare(b))
  const hasGroups = namedGroups.length > 0

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)]/60 px-3 py-2">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            value={aliasQuery}
            onChange={e => setAliasQuery(e.target.value)}
            placeholder="搜索会话别名…"
            aria-label="搜索会话别名"
            className="h-8 w-full rounded-md border bg-[var(--color-background)] pl-7 pr-7 text-xs outline-none focus:border-[var(--color-primary)]"
          />
          {aliasQuery && (
            <button
              type="button"
              onClick={() => setAliasQuery('')}
              aria-label="清空会话搜索"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Filter className="size-3 shrink-0 text-[var(--color-muted-foreground)]" />
        <Popover open={groupFilterOpen} onOpenChange={setGroupFilterOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="按分组筛选（可多选）"
              className={cn(
                'flex h-7 max-w-40 items-center gap-1 rounded-md border bg-[var(--color-background)] px-1.5 text-xs',
                filterGroups.length > 0 && 'border-[var(--color-primary)] text-[var(--color-primary)]',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {filterGroups.length === 0
                  ? '全部分组'
                  : filterGroups.map(g => g === UNGROUPED ? '未分组' : g).join('、')}
              </span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <ul className="max-h-56 overflow-y-auto">
              <li>
                <button
                  type="button"
                  onClick={() => toggleFilterGroup(UNGROUPED)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]"
                >
                  <CheckBox checked={filterGroups.includes(UNGROUPED)} />
                  未分组
                </button>
              </li>
              {allGroups.map(g => (
                <li key={g}>
                  <button
                    type="button"
                    onClick={() => toggleFilterGroup(g)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]"
                  >
                    <CheckBox checked={filterGroups.includes(g)} />
                    <span className="min-w-0 flex-1 truncate">{g}</span>
                  </button>
                </li>
              ))}
            </ul>
            {filterGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterGroups([])}
                className="mt-1 w-full rounded-sm border-t px-2 py-1.5 text-left text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
              >
                清空分组筛选
              </button>
            )}
          </PopoverContent>
        </Popover>
        <select
          value={filterPrd}
          onChange={e => setFilterPrd(e.target.value as typeof filterPrd)}
          aria-label="按是否关联 PRD 筛选"
          className="h-7 max-w-28 rounded-md border bg-[var(--color-background)] px-1.5 text-xs"
        >
          <option value="all">全部会话</option>
          <option value="linked">已关联 PRD</option>
          <option value="unlinked">未关联 PRD</option>
        </select>
        {filterActive && (
          <button
            type="button"
            onClick={clearFilter}
            className="ml-auto shrink-0 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
          >
            清除筛选
          </button>
        )}
      </div>
      {filteredSessions.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
          没有匹配搜索或筛选条件的会话
        </div>
      ) : !hasGroups ? (
        <ul className="py-1">
          {[...(buckets.get(UNGROUPED)?.values() ?? [])].flat().map(s => renderRow(s, false))}
        </ul>
      ) : (
        <div className="py-1">
          {namedGroups.map(name => renderProjectSection(name, name, buckets.get(name)!, false))}
          {buckets.has(UNGROUPED) && renderProjectSection(UNGROUPED, '未分组', buckets.get(UNGROUPED)!, true)}
        </div>
      )}
      {groupPickFor && (
        <GroupPicker
          currentProject={(groupPickFor.group ?? '').trim()}
          currentRequirement={(groupPickFor.subgroup ?? '').trim()}
          all={allGroupPaths}
          onPick={(project, requirement) => { void applyGroup(groupPickFor.id, project, requirement); setGroupPickFor(null) }}
          onClose={() => setGroupPickFor(null)}
        />
      )}
    </>
  )

  // ─── Section ───────────────────────────────────────────────────────────────

  function renderProjectSection(key: string, label: string, requirements: Map<string, ClaudeChatSessionView[]>, ungrouped: boolean) {
    const collapseKey = `project:${key}`
    const open = !collapsed.has(collapseKey)
    const count = [...requirements.values()].reduce((sum, list) => sum + list.length, 0)
    const namedRequirements = [...requirements.keys()].filter(x => x !== UNGROUPED).sort((a, b) => a.localeCompare(b))
    return (
      <section key={`sec:${key}`} className="mt-3 mb-1">
        {/* Section header：明显的背景 + 下边框，与 Item 形成真正的层级区分 */}
        <button
          type="button"
          onClick={() => toggleGroup(collapseKey)}
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
            {count}
          </span>
        </button>
        {open && (
          <div>
            {namedRequirements.map(requirement => renderRequirementSection(key, requirement, requirement, requirements.get(requirement)!))}
            {requirements.has(UNGROUPED)
              && renderRequirementSection(key, UNGROUPED, ungrouped ? '未分类会话' : '未指定需求', requirements.get(UNGROUPED)!)}
          </div>
        )}
      </section>
    )
  }

  function renderRequirementSection(project: string, key: string, label: string, list: ClaudeChatSessionView[]) {
    const collapseKey = `requirement:${project}:${key}`
    const open = !collapsed.has(collapseKey)
    return (
      <section key={collapseKey} className="border-b border-[var(--color-border)]/30">
        <button
          type="button"
          onClick={() => toggleGroup(collapseKey)}
          className="flex w-full items-center gap-1.5 bg-[var(--color-muted)]/25 py-2 pl-7 pr-3 text-left"
        >
          <ChevronRight className={cn('size-3 shrink-0 text-[var(--color-muted-foreground)] transition-transform', open && 'rotate-90')} />
          <Folder className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-foreground)]/75">{label}</span>
          <span className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">{list.length}</span>
        </button>
        {open && <ul>{list.map(s => renderRow(s, true))}</ul>}
      </section>
    )
  }

  // ─── Row ───────────────────────────────────────────────────────────────────

  function renderRow(s: ClaudeChatSessionView, inGroup: boolean) {
    const isActive = s.id === currentSessionId
    const linkedPrd = prdLinks[s.id]
    const isRunning = s.status === 'RUNNING' && s.live

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
          'group relative isolate flex items-center gap-1 transition-colors duration-100',
          isActive ? 'bg-[var(--color-primary)]/10' : 'hover:bg-[var(--color-accent)]',
        )}
      >
        {isRunning && <SessionActivityBar />}
        {/* Left Accent Bar：4px 加宽，选中态更醒目 */}
        <div className={cn(
          'absolute inset-y-0 left-0 z-20 w-[4px] rounded-r-sm transition-colors duration-100',
          isActive ? 'bg-[var(--color-primary)]' : 'bg-transparent group-hover:bg-[var(--color-border)]',
        )} />

        {selectable && (
          <input
            type="checkbox"
            className="relative z-10 ml-4 size-4 shrink-0"
            checked={selectedIds?.has(s.id) ?? false}
            onChange={() => onToggleSelect?.(s.id)}
            aria-label={`选择会话 ${s.title || shortCwd(s.cwd)}`}
          />
        )}

        {editingId === s.id ? (
          <input
            autoFocus
            className={cn('relative z-10 min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm', inGroup ? 'ml-8' : 'ml-5')}
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
              'relative z-10 min-h-[44px] min-w-0 flex-1 py-2.5 pr-2 text-left',
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
                : <EngineIcon engine={s.engine || 'claude'} thirdParty={s.providerKind === 'thirdParty'} className="size-3" muted />
              }
              <span className={cn(
                'min-w-0 flex-1 truncate text-sm leading-snug',
                isActive
                  ? 'font-semibold text-[var(--color-primary)]'
                  : 'font-medium text-[var(--color-foreground)]',
              )}>
                {s.title || shortCwd(s.cwd)}
              </span>
              {linkedPrd && (
                <span
                  title={`已关联 PRD：${linkedPrd.title || '（未命名）'}`}
                  className="shrink-0 text-[var(--color-primary)] opacity-70"
                >
                  <Link2 className="size-3" />
                </span>
              )}
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
            className="relative z-10 mr-1 rounded p-1.5 text-[var(--color-primary)]"
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
              'absolute inset-y-0 right-0 z-10 flex items-center pl-2 pr-1',
              // 触屏没有 hover：移动端始终显示操作，桌面端仍在 hover 时出现。
              'opacity-100 transition-opacity duration-100 sm:opacity-0 sm:group-hover:opacity-100',
              isActive ? 'bg-[var(--color-primary)]/10' : 'bg-[var(--color-accent)]',
            )}
          >
            <button
              type="button"
              className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              onClick={e => { e.stopPropagation(); assignGroup(s) }}
              aria-label="设置系统和需求分组"
              title="设置系统和需求分组"
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
              onClick={e => { e.stopPropagation(); void remove(s) }}
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

/** 分组筛选下拉里的方形复选框，样式与 components/ui/multi-select.tsx 的候选项复选框保持一致。 */
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border',
        checked
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'border-[var(--color-border)]',
      )}
    >
      {checked && <Check className="size-3" />}
    </span>
  )
}

// ─── GroupPicker ─────────────────────────────────────────────────────────────

function GroupPicker({ currentProject, currentRequirement, all, onPick, onClose }: {
  currentProject: string
  currentRequirement: string
  all: { project: string; requirement: string }[]
  onPick: (project: string | null, requirement?: string | null) => void
  onClose: () => void
}) {
  const [project, setProject] = useState(currentProject)
  const [requirement, setRequirement] = useState(currentRequirement)
  const projects = [...new Set(all.map(x => x.project))].sort((a, b) => a.localeCompare(b))
  const requirements = [...new Set(all
    .filter(x => x.project === project && x.requirement)
    .map(x => x.requirement))].sort((a, b) => a.localeCompare(b))
  const canSave = !!project.trim()

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-24" onClick={onClose} role="dialog" aria-label="移动到分组">
      <div className="w-80 rounded-xl border bg-[var(--color-popover)] p-3 text-[var(--color-popover-foreground)] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Tags className="size-4 text-[var(--color-primary)]" />设置两级分组
          <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"><X className="size-4" /></button>
        </div>
        <label className="block text-xs font-medium text-[var(--color-muted-foreground)]">
          一级：系统 / 项目
          <Combobox
            autoFocus
            value={project}
            onChange={value => { setProject(value); setRequirement('') }}
            options={projects.map(value => ({ value, label: value }))}
            showAllOnOpen
            placeholder="例如：SRM、ERP、kai-toolbox"
            emptyText="没有匹配的项目，可直接输入新项目"
            className="mt-1 font-normal text-[var(--color-foreground)]"
            contentClassName="z-[90]"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-[var(--color-muted-foreground)]">
          二级：需求
          <Combobox
            value={requirement}
            disabled={!project.trim()}
            onChange={setRequirement}
            options={requirements.map(value => ({ value, label: value }))}
            showAllOnOpen
            placeholder="例如：报价含税含运改造"
            emptyText="没有匹配的需求，可直接输入新需求"
            className="mt-1 font-normal text-[var(--color-foreground)]"
            contentClassName="z-[90]"
          />
        </label>
        <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">同一系统/项目下可建立多个需求分组，会话归档到具体需求中。</p>
        <div className="mt-3 flex items-center gap-2">
          {(currentProject || currentRequirement) && (
            <button type="button" onClick={() => onPick(null)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]">
              <FolderMinus className="size-3.5" />移出分组
            </button>
          )}
          <button type="button" onClick={() => onPick(project.trim(), requirement.trim() || null)} disabled={!canSave} className="ml-auto inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs text-[var(--color-primary-foreground)] disabled:opacity-50">
            <FolderPlus className="size-3.5" />保存分组
          </button>
        </div>
      </div>
    </div>
  )
}

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}
