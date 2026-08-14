import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  FolderKanban,
  Globe2,
  KeyRound,
  LoaderCircle,
  MonitorCog,
  Network,
  PanelTop,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WandSparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  bindPermissions,
  getRole,
  listPermissions,
  type PermissionView,
  type RoleView,
} from '../api'

const PERMS_KEY = ['forge-permissions']

type Icon = ComponentType<{ className?: string }>

interface PermissionGroup {
  id: string
  name: string
  description: string
  permissions: PermissionView[]
}

interface PermissionCategory {
  id: string
  name: string
  description: string
  icon: Icon
  groups: PermissionGroup[]
  order: number
}

interface GroupRule {
  id: string
  name: string
  description: string
  matches: (permission: PermissionView) => boolean
}

const CATEGORY_META: Record<string, { name: string; description: string; icon: Icon; order: number }> = {
  security: { name: '权限与安全', description: '组织、角色与成员授权', icon: ShieldCheck, order: 0 },
  AI: { name: 'AI', description: '智能助手与研发能力', icon: Sparkles, order: 10 },
  系统: { name: '系统', description: '平台配置与开发工具', icon: MonitorCog, order: 20 },
  项目开发: { name: '项目', description: '业务系统与项目空间', icon: FolderKanban, order: 30 },
  网络: { name: '网络', description: '连接、传输与网络工具', icon: Globe2, order: 40 },
  运维: { name: '运维', description: '基础设施与服务治理', icon: Network, order: 50 },
  媒体: { name: '媒体', description: '视频、音频与媒体处理', icon: Boxes, order: 60 },
  内容: { name: '内容', description: '内容生产与转换工具', icon: WandSparkles, order: 70 },
  效率: { name: '效率', description: '个人效率工具', icon: CircleDot, order: 80 },
  企业: { name: '企业', description: '企业业务能力', icon: UsersRound, order: 90 },
  智能体: { name: '智能体', description: '智能分析与自动化', icon: Bot, order: 100 },
  参考: { name: '参考', description: '文档与知识参考', icon: Code2, order: 110 },
}

const GROUP_RULES: Record<string, GroupRule[]> = {
  security: [
    {
      id: 'organization',
      name: '组织与成员',
      description: '部门结构和用户授权',
      matches: (p) => p.module === 'forge-department' || p.module === 'forge-user',
    },
    {
      id: 'roles',
      name: '角色与策略',
      description: '角色定义和权限策略',
      matches: (p) => p.module === 'forge-role',
    },
  ],
  AI: [
    {
      id: 'assistant',
      name: 'Assistant',
      description: '对话、咨询和内容助手',
      matches: (p) => includesAny(p.code, ['ai-chat', 'fore-consult', 'prd-clarify']),
    },
    {
      id: 'development',
      name: 'Development',
      description: '需求与 AI 研发工作流',
      matches: (p) => includesAny(p.code, ['claude-chat', 'project-workspace', 'reqpool']),
    },
    {
      id: 'evaluation',
      name: 'Evaluation',
      description: '测试、回归与质量评测',
      matches: (p) => includesAny(p.code, ['eval']),
    },
  ],
  系统: [
    {
      id: 'foundation',
      name: '基础配置',
      description: '账号、配置与目录能力',
      matches: (p) => includesAny(p.code, ['account-admin', 'config-center', 'flatten']),
    },
    {
      id: 'operations',
      name: '系统运维',
      description: '系统状态、进程与空间管理',
      matches: (p) => includesAny(p.code, ['ops', 'port-process', 'treesize']),
    },
    {
      id: 'developer-tools',
      name: '开发工作台',
      description: '项目、任务与远程开发工具',
      matches: (p) => includesAny(p.code, ['projects', 'task-center', 'vscode-tunnel', 'webterm']),
    },
  ],
}

const GENERIC_GROUP_NAMES: Record<string, { name: string; description: string }> = {
  项目开发: { name: '业务系统', description: '项目与业务系统入口' },
  网络: { name: '网络工具', description: '网络访问、传输与采集' },
  运维: { name: '基础设施', description: '基础设施和服务治理' },
  媒体: { name: '媒体处理', description: '媒体生产、处理与管理' },
  内容: { name: '内容工具', description: '内容创建、转换与呈现' },
}

export function PermissionExplorer({ role, onClose }: { role: RoleView; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: permissions = [], isPending: permissionsPending } = useQuery({
    queryKey: PERMS_KEY,
    queryFn: listPermissions,
  })
  const { data: detail, isPending: detailPending } = useQuery({
    queryKey: ['forge-role', role.id],
    queryFn: () => getRole(role.id),
  })
  const [checked, setChecked] = useState<Set<number> | null>(null)
  const [query, setQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [activeGroupId, setActiveGroupId] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (detail && checked === null) setChecked(new Set(detail.permissionIds))
  }, [detail, checked])

  const categories = useMemo(() => buildCategories(permissions), [permissions])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleCategories = useMemo(
    () => filterCategories(categories, normalizedQuery),
    [categories, normalizedQuery],
  )

  useEffect(() => {
    if (!visibleCategories.length) return
    if (!visibleCategories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(visibleCategories[0].id)
    }
  }, [activeCategoryId, visibleCategories])

  const activeCategory =
    visibleCategories.find((category) => category.id === activeCategoryId) ?? visibleCategories[0]

  useEffect(() => {
    if (!activeCategory?.groups.length) return
    if (!activeCategory.groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(activeCategory.groups[0].id)
    }
  }, [activeCategory, activeGroupId])

  const activeGroup =
    activeCategory?.groups.find((group) => group.id === activeGroupId) ?? activeCategory?.groups[0]
  const current = checked ?? new Set<number>()
  const initial = useMemo(() => new Set(detail?.permissionIds ?? []), [detail])
  const changedCount = symmetricDifferenceSize(current, initial)
  const loading = permissionsPending || detailPending || checked === null

  const save = useMutation({
    mutationFn: () => bindPermissions(role.id, [...current]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forge-role', role.id] })
      onClose()
    },
    onError: (e) => setErr((e as Error).message),
  })

  const updatePermissions = (target: PermissionView[], enabled?: boolean) => {
    const next = new Set(current)
    const shouldEnable = enabled ?? !target.every((permission) => next.has(permission.id))
    for (const permission of target) {
      if (shouldEnable) next.add(permission.id)
      else next.delete(permission.id)
    }
    setChecked(next)
    setErr(null)
  }

  const togglePermission = (permission: PermissionView) => {
    const next = new Set(current)
    const enabled = !next.has(permission.id)

    if (enabled) {
      next.add(permission.id)
      if (permission.parentCode) {
        const parent = permissions.find((candidate) => candidate.code === permission.parentCode)
        if (parent) next.add(parent.id)
      }
    } else {
      next.delete(permission.id)
      if (!permission.parentCode) {
        permissions
          .filter((candidate) => candidate.parentCode === permission.code)
          .forEach((child) => next.delete(child.id))
      }
    }

    setChecked(next)
    setErr(null)
  }

  return (
    <div className="mx-auto flex h-full min-h-[560px] w-full max-w-[1480px] flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-lg border bg-[var(--color-card)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
          aria-label="返回角色管理"
        >
          <X className="size-4" />
        </button>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] text-sm font-semibold text-[var(--color-primary)]">
          {role.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">{role.name}</h2>
            <span className="rounded-md border bg-[var(--color-muted)]/60 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-muted-foreground)]">
              {role.code}
            </span>
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">配置角色可访问的模块与操作权限</p>
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索权限名称或代码…"
            className="h-10 w-full rounded-xl border bg-[var(--color-card)] pl-9 pr-9 text-sm outline-none transition-shadow placeholder:text-[var(--color-muted-foreground)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-primary)_20%,transparent)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              aria-label="清空搜索"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-sm">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载权限结构…
          </div>
        ) : visibleCategories.length === 0 ? (
          <EmptySearch query={query} onClear={() => setQuery('')} />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(150px,0.55fr)_minmax(320px,1fr)] md:grid-cols-[minmax(190px,0.75fr)_minmax(230px,0.95fr)_minmax(360px,1.55fr)] md:grid-rows-1">
            <ExplorerColumn
              title="分类"
              subtitle={`${visibleCategories.length} 个权限域`}
              className="hidden md:flex"
            >
              <nav className="space-y-1 p-2" aria-label="权限分类">
                {visibleCategories.map((category) => {
                  const CategoryIcon = category.icon
                  const categoryPermissions = flattenCategory(category)
                  const enabledCount = countEnabled(categoryPermissions, current)
                  const active = category.id === activeCategory?.id
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setActiveCategoryId(category.id)
                        setActiveGroupId(category.groups[0]?.id ?? '')
                      }}
                      className={cn(
                        'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                        active
                          ? 'bg-[color-mix(in_oklab,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]'
                          : 'hover:bg-[var(--color-muted)]/70',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg border bg-[var(--color-background)]',
                          active && 'border-[color-mix(in_oklab,var(--color-primary)_25%,var(--color-border))]',
                        )}
                      >
                        <CategoryIcon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{category.name}</span>
                        <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">
                          {category.description}
                        </span>
                      </span>
                      <span className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
                        {enabledCount}/{categoryPermissions.length}
                      </span>
                      <ChevronRight className={cn('size-3.5 opacity-0', active && 'opacity-100')} />
                    </button>
                  )
                })}
              </nav>
            </ExplorerColumn>

            <ExplorerColumn
              title={normalizedQuery ? '搜索结果' : '权限组'}
              subtitle={activeCategory ? `${activeCategory.name} · ${activeCategory.groups.length} 组` : undefined}
              className="border-t md:border-l md:border-t-0"
            >
              <div className="flex gap-1.5 overflow-x-auto border-b p-2 md:hidden">
                {visibleCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setActiveCategoryId(category.id)
                      setActiveGroupId(category.groups[0]?.id ?? '')
                    }}
                    className={cn(
                      'shrink-0 rounded-lg border px-2.5 py-1.5 text-xs',
                      category.id === activeCategory?.id
                        ? 'border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]'
                        : 'bg-[var(--color-background)]',
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              <nav className="space-y-1 p-2" aria-label="权限组">
                {activeCategory?.groups.map((group) => {
                  const enabledCount = countEnabled(group.permissions, current)
                  const active = group.id === activeGroup?.id
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setActiveGroupId(group.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all',
                        active
                          ? 'border-[color-mix(in_oklab,var(--color-primary)_30%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-primary)_7%,transparent)] shadow-sm'
                          : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]/55',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg',
                          enabledCount > 0
                            ? 'bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]'
                            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                        )}
                      >
                        <KeyRound className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{group.name}</span>
                        <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">
                          {group.description}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[10px] tabular-nums',
                          enabledCount
                            ? 'bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]'
                            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                        )}
                      >
                        {enabledCount}/{group.permissions.length}
                      </span>
                      <ChevronRight className={cn('size-3.5 text-[var(--color-muted-foreground)]', active && 'text-[var(--color-primary)]')} />
                    </button>
                  )
                })}
              </nav>
            </ExplorerColumn>

            <ExplorerColumn
              title="权限"
              subtitle={activeGroup?.description}
              className="border-t md:border-l md:border-t-0"
              actions={
                activeGroup ? (
                  <GroupToggle
                    permissions={activeGroup.permissions}
                    checked={current}
                    onToggle={() => updatePermissions(activeGroup.permissions)}
                  />
                ) : null
              }
            >
              {activeCategory && activeGroup && (
                <div className="space-y-4 p-4">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                      <span>{activeCategory.name}</span>
                      <ChevronRight className="size-3" />
                      <span>{activeGroup.name}</span>
                    </div>
                    <h3 className="text-lg font-semibold">{activeGroup.name}</h3>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      开启操作权限时会自动授予其所属模块的访问权限。
                    </p>
                  </div>

                  <div className="space-y-2">
                    {activeGroup.permissions.map((permission) => (
                      <PermissionRow
                        key={permission.id}
                        permission={permission}
                        enabled={current.has(permission.id)}
                        onToggle={() => togglePermission(permission)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </ExplorerColumn>
          </div>
        )}

        <footer className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t bg-[var(--color-muted)]/25 px-4 py-3">
          <Stat label="已授权" value={`${current.size} 项`} />
          <Stat label="已修改" value={`${changedCount} 项`} emphasized={changedCount > 0} />
          {err && <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-destructive)]">{err}</p>}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={loading || changedCount === 0 || save.isPending}
              onClick={() => save.mutate()}
              className="min-w-24"
            >
              {save.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
              保存变更
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function ExplorerColumn({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b px-4">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-[10px] text-[var(--color-muted-foreground)]">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}

function PermissionRow({
  permission,
  enabled,
  onToggle,
}: {
  permission: PermissionView
  enabled: boolean
  onToggle: () => void
}) {
  const isMenu = permission.type === 'MENU'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
        enabled
          ? 'border-[color-mix(in_oklab,var(--color-primary)_24%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-primary)_5%,transparent)]'
          : 'hover:border-[color-mix(in_oklab,var(--color-foreground)_16%,var(--color-border))] hover:bg-[var(--color-muted)]/40',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          enabled
            ? 'bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]'
            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
        )}
      >
        {isMenu ? <PanelTop className="size-4" /> : <CircleDot className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{permission.name}</span>
          <span className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {isMenu ? 'Module' : 'Action'}
          </span>
        </span>
        <span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-muted-foreground)]">
          {permission.code}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          enabled ? 'bg-[var(--color-primary)]' : 'bg-[color-mix(in_oklab,var(--color-foreground)_16%,transparent)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
            enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

function GroupToggle({
  permissions,
  checked,
  onToggle,
}: {
  permissions: PermissionView[]
  checked: Set<number>
  onToggle: () => void
}) {
  const allEnabled = permissions.every((permission) => checked.has(permission.id))
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[color-mix(in_oklab,var(--color-primary)_9%,transparent)]"
    >
      {allEnabled ? '全部关闭' : '全部开启'}
    </button>
  )
}

function Stat({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 text-xs">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className={cn('font-semibold tabular-nums', emphasized && 'text-[var(--color-primary)]')}>{value}</span>
    </div>
  )
}

function EmptySearch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
        <Search className="size-5" />
      </span>
      <p className="text-sm font-medium">没有找到“{query}”</p>
      <p className="text-xs text-[var(--color-muted-foreground)]">试试权限名称、模块名称或权限代码</p>
      <Button size="sm" variant="ghost" onClick={onClear}>
        清空搜索
      </Button>
    </div>
  )
}

function buildCategories(permissions: PermissionView[]): PermissionCategory[] {
  const activePermissions = permissions
    .filter((permission) => permission.status !== 'DEPRECATED')
    .sort((a, b) => a.sort - b.sort)
  const buckets = new Map<string, PermissionView[]>()

  for (const permission of activePermissions) {
    const categoryId = permission.module.startsWith('forge-') ? 'security' : permission.module
    const bucket = buckets.get(categoryId)
    if (bucket) bucket.push(permission)
    else buckets.set(categoryId, [permission])
  }

  return [...buckets.entries()]
    .map(([id, categoryPermissions], index) => {
      const meta = CATEGORY_META[id] ?? {
        name: id,
        description: '模块权限',
        icon: Boxes,
        order: 500 + index,
      }
      return {
        id,
        ...meta,
        groups: buildGroups(id, categoryPermissions),
      }
    })
    .sort((a, b) => a.order - b.order)
}

function buildGroups(categoryId: string, permissions: PermissionView[]): PermissionGroup[] {
  const rules = GROUP_RULES[categoryId]
  if (rules) {
    const matchedIds = new Set<number>()
    const groups = rules
      .map((rule) => {
        const matched = permissions.filter((permission) => rule.matches(permission))
        matched.forEach((permission) => matchedIds.add(permission.id))
        return { id: `${categoryId}:${rule.id}`, name: rule.name, description: rule.description, permissions: matched }
      })
      .filter((group) => group.permissions.length > 0)

    const unmatched = permissions.filter((permission) => !matchedIds.has(permission.id))
    if (unmatched.length) {
      groups.push({
        id: `${categoryId}:other`,
        name: '其他能力',
        description: '此分类下的其他权限',
        permissions: unmatched,
      })
    }
    return groups
  }

  const generic = GENERIC_GROUP_NAMES[categoryId]
  if (generic) {
    return [{ id: `${categoryId}:all`, ...generic, permissions }]
  }

  const roots = permissions.filter((permission) => !permission.parentCode)
  if (!roots.length) {
    return [{ id: `${categoryId}:all`, name: '模块权限', description: '模块内可用权限', permissions }]
  }

  return roots.map((root) => ({
    id: `${categoryId}:${root.code}`,
    name: root.name,
    description: `${root.name}的访问与操作权限`,
    permissions: [root, ...permissions.filter((permission) => permission.parentCode === root.code)],
  }))
}

function filterCategories(categories: PermissionCategory[], query: string): PermissionCategory[] {
  if (!query) return categories
  return categories
    .map((category) => {
      const categoryMatches = searchable(category.name, category.description, category.id).includes(query)
      const groups = category.groups
        .map((group) => {
          const groupMatches = searchable(group.name, group.description).includes(query)
          const permissions = groupMatches || categoryMatches
            ? group.permissions
            : group.permissions.filter((permission) =>
                searchable(permission.name, permission.code, permission.module, permission.type).includes(query),
              )
          return { ...group, permissions }
        })
        .filter((group) => group.permissions.length > 0)
      return { ...category, groups }
    })
    .filter((category) => category.groups.length > 0)
}

function flattenCategory(category: PermissionCategory): PermissionView[] {
  const unique = new Map<number, PermissionView>()
  category.groups.flatMap((group) => group.permissions).forEach((permission) => unique.set(permission.id, permission))
  return [...unique.values()]
}

function countEnabled(permissions: PermissionView[], checked: Set<number>) {
  return permissions.filter((permission) => checked.has(permission.id)).length
}

function symmetricDifferenceSize(a: Set<number>, b: Set<number>) {
  let count = 0
  a.forEach((value) => {
    if (!b.has(value)) count += 1
  })
  b.forEach((value) => {
    if (!a.has(value)) count += 1
  })
  return count
}

function includesAny(value: string, fragments: string[]) {
  return fragments.some((fragment) => value.includes(fragment))
}

function searchable(...values: string[]) {
  return values.join(' ').toLocaleLowerCase()
}
