import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Boxes, BotMessageSquare, Compass, CornerDownRight, FolderTree, Loader2, Pin, Play, RefreshCw, Search, Send, TerminalSquare, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { createTaskspace, fetchProjectModules, listSessions, listWorkspaces, resolveModule } from '@/features/claude-chat/api'
import { VoiceInputButton } from '@/features/claude-chat/components/VoiceInputButton'
import { CHAT_ROUTE, useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import type { ClaudeChatSessionView, ModuleCandidate, ProjectModule, ProjectModules, WorkspaceDir } from '@/features/claude-chat/types'
import { AGGREGATION_DRAFT_KEY, useAggregationCart, type AggregationItem } from '../hooks/useAggregationCart'

interface PendingOpen {
  module: ProjectModule
  sessionId: string | null
}

/** 项目工作台：从配置工作区选项目，按确定性模块扫描结果进入对应 Vibe Coding 会话。 */
export function ProjectWorkspacePage() {
  const navigate = useNavigate()
  const { chat, activate } = useChatRuntime()
  const [selectedPath, setSelectedPath] = useState('')
  const [keyword, setKeyword] = useState('')
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null)

  const workspacesQ = useQuery({
    queryKey: ['claude-chat-workspaces'],
    queryFn: listWorkspaces,
    staleTime: 5000,
  })
  const sessionsQ = useQuery({
    queryKey: ['claude-chat-sessions'],
    queryFn: listSessions,
    staleTime: 5000,
  })
  const modulesQ = useQuery({
    queryKey: ['project-workspace-modules', selectedPath],
    queryFn: () => fetchProjectModules(selectedPath),
    enabled: selectedPath.length > 0,
    staleTime: 5000,
  })

  const projects = useMemo(
    () => workspacesQ.data?.roots.flatMap(root => root.dirs.map(dir => ({ ...dir, root: root.root }))) ?? [],
    [workspacesQ.data],
  )
  const selectedProject = projects.find(project => project.path === selectedPath)
  const sessions = sessionsQ.data ?? []
  const sessionByCwd = useMemo(() => {
    const map = new Map<string, ClaudeChatSessionView>()
    sessions.forEach(session => map.set(normalizePath(session.cwd), session))
    return map
  }, [sessions])
  const filteredModules = useMemo(() => {
    const modules = modulesQ.data?.modules ?? []
    const q = keyword.trim().toLowerCase()
    if (!q) return modules
    return filterModuleTree(modules, q)
  }, [keyword, modulesQ.data?.modules])

  useEffect(() => {
    if (selectedPath || projects.length === 0) return
    setSelectedPath(projects[0].path)
  }, [projects, selectedPath])

  useEffect(() => {
    if (!chat || !pendingOpen) return
    if (pendingOpen.sessionId) chat.switchTo(pendingOpen.sessionId)
    else chat.open(pendingOpen.module.absPath)
    setPendingOpen(null)
    navigate(CHAT_ROUTE)
  }, [chat, navigate, pendingOpen])

  const openModule = (module: ProjectModule) => {
    const session = sessionByCwd.get(normalizePath(module.absPath))
    const next = { module, sessionId: session?.id ?? null }
    if (!chat) {
      setPendingOpen(next)
      activate()
      return
    }
    if (next.sessionId) chat.switchTo(next.sessionId)
    else chat.open(module.absPath)
    navigate(CHAT_ROUTE)
  }

  // ── 跨项目「待聚合」篮子：钉选多项目模块 → 一键聚合为合并工作区联动开发 ──
  const confirm = useConfirm()
  const cart = useAggregationCart()
  const [aggregating, setAggregating] = useState(false)
  const [aggErr, setAggErr] = useState('')

  /** 把当前选中项目下的一个模块钉入/移出篮子。 */
  const pinModule = (module: ProjectModule) => {
    if (!selectedProject) return
    cart.toggle({
      projectName: selectedProject.name,
      projectPath: selectedProject.path,
      moduleName: module.name,
      moduleRelPath: module.relPath,
      modulePath: module.absPath,
    })
  }

  /** 一键聚合:按项目根去重软链成合并工作区，预填联动提示并开会话。 */
  const aggregate = async () => {
    if (cart.items.length < 1 || !chat) return
    const roots = [...new Set(cart.items.map(i => i.projectPath))]
    setAggErr('')
    setAggregating(true)
    try {
      const base = roots[0].replace(/[\\/][^\\/]+$/, '') // 取第一个项目的父目录作为放置目录
      const name = `aggregate-${Date.now().toString(36)}`
      const view = await createTaskspace(base, name, roots)
      sessionStorage.setItem(AGGREGATION_DRAFT_KEY, buildLinkagePrompt(cart.items, view.dir))
      cart.clear()
      chat.open(view.dir)
      navigate(CHAT_ROUTE)
    } catch (e) {
      setAggErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAggregating(false)
    }
  }

  const clearCart = async () => {
    if (cart.items.length === 0) return
    const ok = await confirm({ title: '清空待聚合', description: '移除所有已钉选模块?', confirmText: '清空', variant: 'destructive' })
    if (ok) cart.clear()
  }

  // ── 模块路由：说一句话 → 确定性解析 (项目, 模块) → 确认后拉起会话 ──
  const [routeQuery, setRouteQuery] = useState('')
  const [picked, setPicked] = useState<ModuleCandidate | null>(null)
  const resolveMut = useMutation({
    mutationFn: resolveModule,
    // 唯一命中直接进确认卡；多个候选清空 picked，渲染「选哪个项目」列表
    onSuccess: result => setPicked(result.candidates.length === 1 ? result.candidates[0] : null),
  })
  const runResolve = (text: string) => {
    const q = text.trim()
    if (!q) return
    setPicked(null)
    resolveMut.mutate(q)
  }
  // 确认拉起：选中左侧项目（视觉对齐「点击项目」）+ 进入该模块会话
  const launchCandidate = (candidate: ModuleCandidate) => {
    setSelectedPath(candidate.projectPath)
    openModule(candidate.module)
  }
  const resolveResult = resolveMut.data
  const routeHint = resolveResult ? (resolveResult.moduleHint || resolveResult.query) : ''

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <FolderTree className="h-4 w-4" />
            项目工作台
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-[var(--color-foreground)]">
            项目模块
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {selectedProject ? selectedProject.path : '读取配置工作区中'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedProject ? (
            <ProjectTypeBadge
              loading={modulesQ.isLoading || (modulesQ.isFetching && !modulesQ.data)}
              data={modulesQ.data}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void workspacesQ.refetch()
              void modulesQ.refetch()
              void sessionsQ.refetch()
            }}
            disabled={workspacesQ.isFetching || modulesQ.isFetching || sessionsQ.isFetching}
          >
            <RefreshCw className={cn((workspacesQ.isFetching || modulesQ.isFetching || sessionsQ.isFetching) && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="h-4 w-4" />
            模块路由
          </CardTitle>
          <CardDescription>
            说一句话直达：「去开发 commodity 模块」「korepos 的 refund」——自动定位项目 + 模块并拉起会话
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex items-center gap-2"
            onSubmit={event => {
              event.preventDefault()
              runResolve(routeQuery)
            }}
          >
            <Input
              className="flex-1"
              value={routeQuery}
              onChange={event => setRouteQuery(event.target.value)}
              placeholder="例如：去开发 commodity 模块 / korepos 的 refund"
            />
            <VoiceInputButton onText={text => { setRouteQuery(text); runResolve(text) }} />
            <Button type="submit" disabled={!routeQuery.trim() || resolveMut.isPending}>
              {resolveMut.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              定位
            </Button>
          </form>

          {resolveMut.isError ? (
            <p className="text-sm text-[var(--color-destructive)]">{errorMessage(resolveMut.error)}</p>
          ) : resolveResult ? (
            picked ? (
              <RouteTarget
                candidate={picked}
                session={sessionByCwd.get(normalizePath(picked.module.absPath))}
                multi={resolveResult.candidates.length > 1}
                onLaunch={() => launchCandidate(picked)}
                onBack={() => setPicked(null)}
              />
            ) : resolveResult.candidates.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                未匹配到模块「{routeHint}」。换个模块名，或带上项目名（如「korepos 的 refund」）再试。
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  「{routeHint}」匹配到 {resolveResult.candidates.length} 处，它是哪个项目的？
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {resolveResult.candidates.map(candidate => (
                    <CandidateButton
                      key={`${candidate.projectPath}|${candidate.module.absPath}`}
                      candidate={candidate}
                      hasSession={Boolean(sessionByCwd.get(normalizePath(candidate.module.absPath)))}
                      onClick={() => setPicked(candidate)}
                    />
                  ))}
                </div>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      {cart.items.length > 0 && (
        <AggregationCart
          items={cart.items}
          aggregating={aggregating}
          error={aggErr}
          onRemove={cart.remove}
          onClear={clearCart}
          onAggregate={aggregate}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderTree className="h-4 w-4" />
              项目
            </CardTitle>
            <CardDescription>来自 Vibe Coding 工作区配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {workspacesQ.isLoading ? (
              <StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="正在读取项目" />
            ) : workspacesQ.isError ? (
              <StateLine tone="danger" text={errorMessage(workspacesQ.error)} />
            ) : projects.length === 0 ? (
              <StateLine text="没有可用项目" />
            ) : (
              projects.map(project => (
                <ProjectButton
                  key={project.path}
                  project={project}
                  selected={project.path === selectedPath}
                  onClick={() => {
                    setSelectedPath(project.path)
                    setKeyword('')
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TerminalSquare className="h-4 w-4" />
                  模块
                </CardTitle>
                <CardDescription>
                  {moduleSummary(modulesQ.data?.modules.length ?? 0, filteredModules.length, sessions.length)}
                </CardDescription>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
                <Input
                  className="pl-9"
                  value={keyword}
                  onChange={event => setKeyword(event.target.value)}
                  placeholder="搜索模块 / 类型 / 路径"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {modulesQ.isLoading || modulesQ.isFetching && !modulesQ.data ? (
              <StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="正在扫描模块" />
            ) : modulesQ.isError ? (
              <StateLine tone="danger" text={errorMessage(modulesQ.error)} />
            ) : modulesQ.data && !modulesQ.data.exists ? (
              <StateLine tone="danger" text="项目不存在或不在允许的工作区根目录内" />
            ) : filteredModules.length === 0 ? (
              <StateLine text={keyword.trim() ? '没有匹配模块' : '未识别到模块'} />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {filteredModules.map(module => (
                  <ModuleCard
                    key={module.absPath}
                    module={module}
                    sessionByCwd={sessionByCwd}
                    pendingPath={pendingOpen?.module.absPath ?? null}
                    onOpen={openModule}
                    isPinned={cart.has}
                    onPin={pinModule}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ProjectButton({ project, selected, onClick }: { project: WorkspaceDir & { root: string }; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors',
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
          : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]',
      )}
    >
      <span className="truncate text-sm font-medium text-[var(--color-foreground)]">{project.name}</span>
      <span className="truncate text-xs text-[var(--color-muted-foreground)]">{project.root}</span>
    </button>
  )
}

/** 模块路由：唯一/已选定的目标确认卡，确认后拉起会话。 */
function RouteTarget({
  candidate,
  session,
  multi,
  onLaunch,
  onBack,
}: {
  candidate: ModuleCandidate
  session: ClaudeChatSessionView | undefined
  multi: boolean
  onLaunch: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-muted-foreground)]">已定位目标 · {candidate.project}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-[var(--color-foreground)]">{candidate.module.name}</span>
            <Badge variant={moduleTypeBadge(candidate.module.type)}>{candidate.module.type}</Badge>
            <Badge variant={session ? 'success' : 'outline'}>{session ? '已有会话' : '未打开'}</Badge>
          </div>
          {candidate.module.summary
            ? <div className="mt-1 line-clamp-2 text-xs text-[var(--color-muted-foreground)]">{candidate.module.summary}</div>
            : null}
          <div className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]">{candidate.module.absPath}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {multi ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <X />换一个
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={onLaunch}>
          {session ? <BotMessageSquare /> : <Play />}
          {session ? '拉起会话' : '新建并拉起'}
        </Button>
      </div>
    </div>
  )
}

/** 模块路由：多候选时的「选项目」按钮。 */
function CandidateButton({
  candidate,
  hasSession,
  onClick,
}: {
  candidate: ModuleCandidate
  hasSession: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-w-0 flex-col gap-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-accent)]"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-[var(--color-foreground)]">{candidate.project}</span>
        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="truncate text-sm text-[var(--color-foreground)]">{candidate.module.name}</span>
        {hasSession ? <Badge variant="success" className="text-[10px]">会话</Badge> : null}
      </span>
      <span className="truncate text-xs text-[var(--color-muted-foreground)]">{candidate.module.relPath}</span>
    </button>
  )
}

function ModuleCard({
  module,
  sessionByCwd,
  pendingPath,
  onOpen,
  isPinned,
  onPin,
}: {
  module: ProjectModule
  sessionByCwd: Map<string, ClaudeChatSessionView>
  pendingPath: string | null
  onOpen: (module: ProjectModule) => void
  isPinned: (modulePath: string) => boolean
  onPin: (module: ProjectModule) => void
}) {
  const session = sessionByCwd.get(normalizePath(module.absPath))
  const children = module.children ?? []
  const pinned = isPinned(module.absPath)
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border bg-[var(--color-background)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-[var(--color-foreground)]">{module.name}</span>
            <Badge variant={moduleTypeBadge(module.type)}>{module.type}</Badge>
          </div>
          {module.summary
            ? <div className="mt-1 line-clamp-2 text-xs text-[var(--color-muted-foreground)]">{module.summary}</div>
            : null}
          <div className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]">{module.relPath}</div>
        </div>
        <Badge variant={session ? 'success' : 'outline'}>{session ? '已有会话' : '未打开'}</Badge>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant={pinned ? 'secondary' : 'ghost'}
          className="px-2 text-xs"
          onClick={() => onPin(module)}
          title={pinned ? '已加入待聚合，点击移除' : '钉入待聚合(跨项目联动)'}
        >
          <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
          {pinned ? '已钉' : '钉选'}
        </Button>
        <Button type="button" size="sm" onClick={() => onOpen(module)} disabled={pendingPath === module.absPath}>
          {pendingPath === module.absPath ? <Loader2 className="animate-spin" /> : session ? <BotMessageSquare /> : <Play />}
          {session ? '打开会话' : '新建会话'}
        </Button>
      </div>
      {children.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          {children.map(child => (
            <ModuleChildRow
              key={child.absPath}
              module={child}
              session={sessionByCwd.get(normalizePath(child.absPath))}
              opening={pendingPath === child.absPath}
              onOpen={() => onOpen(child)}
              pinned={isPinned(child.absPath)}
              onPin={() => onPin(child)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 子模块紧凑行：用于嵌套模块（如 crm 域下的子模块），可独立开会话/钉选。 */
function ModuleChildRow({
  module,
  session,
  opening,
  onOpen,
  pinned,
  onPin,
}: {
  module: ProjectModule
  session: ClaudeChatSessionView | undefined
  opening: boolean
  onOpen: () => void
  pinned: boolean
  onPin: () => void
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-[var(--color-muted)]/40 px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="truncate text-sm text-[var(--color-foreground)]">{module.name}</span>
        {session ? <Badge variant="success" className="text-[10px]">会话</Badge> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={pinned ? 'secondary' : 'ghost'}
          className="h-7 px-1.5 text-xs"
          onClick={onPin}
          title={pinned ? '已加入待聚合，点击移除' : '钉入待聚合'}
        >
          <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onOpen} disabled={opening}>
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : session ? <BotMessageSquare className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {session ? '打开' : '新建'}
        </Button>
      </div>
    </div>
  )
}

function StateLine({ text, icon, tone = 'muted' }: { text: string; icon?: React.ReactNode; tone?: 'muted' | 'danger' }) {
  return (
    <div
      className={cn(
        'flex min-h-28 items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm',
        tone === 'danger' ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]',
      )}
    >
      {icon}
      <span>{text}</span>
    </div>
  )
}

function moduleSummary(total: number, shown: number, sessions: number) {
  if (total === 0) return `当前已有 ${sessions} 个 Vibe Coding 会话`
  if (shown === total) return `识别到 ${total} 个模块，当前已有 ${sessions} 个 Vibe Coding 会话`
  return `识别到 ${total} 个模块，当前显示 ${shown} 个`
}

/** 待聚合篮子面板：按项目分组展示已钉模块，可移除/清空/一键聚合。 */
function AggregationCart({
  items,
  aggregating,
  error,
  onRemove,
  onClear,
  onAggregate,
}: {
  items: AggregationItem[]
  aggregating: boolean
  error: string
  onRemove: (modulePath: string) => void
  onClear: () => void
  onAggregate: () => void
}) {
  const projectCount = new Set(items.map(i => i.projectPath)).size
  const grouped = new Map<string, AggregationItem[]>()
  for (const it of items) {
    const arr = grouped.get(it.projectName) ?? []
    arr.push(it)
    grouped.set(it.projectName, arr)
  }
  return (
    <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pin className="h-4 w-4 fill-current" />
          待聚合模块（{items.length}）
        </CardTitle>
        <CardDescription>
          跨项目钉选模块，一键软链各自项目根为合并工作区联动开发；聚合后自动带上联动提示。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[...grouped.entries()].map(([proj, mods]) => (
            <div key={proj} className="min-w-0 rounded-md border bg-[var(--color-background)] px-2.5 py-1.5">
              <div className="mb-1 truncate text-xs font-medium text-[var(--color-foreground)]">{proj}</div>
              <div className="flex flex-wrap gap-1">
                {mods.map(m => (
                  <span key={m.modulePath} className="inline-flex items-center gap-1 rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">
                    {m.moduleName}
                    <button type="button" onClick={() => onRemove(m.modulePath)} aria-label={`移除 ${m.moduleName}`}
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error ? <p className="text-xs text-[var(--color-destructive)]">{error}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={onAggregate} disabled={aggregating || items.length < 1}>
            {aggregating ? <Loader2 className="animate-spin" /> : <Boxes />}
            一键聚合（{projectCount} 个项目）
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={aggregating}>
            <Trash2 />清空
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** 生成聚合会话的联动提示：列出各模块在合并工作区里的相对位置 + 联动诉求，预填进输入框。 */
function buildLinkagePrompt(items: AggregationItem[], wsDir: string): string {
  void wsDir
  const byProject = new Map<string, AggregationItem[]>()
  for (const it of items) {
    const arr = byProject.get(it.projectName) ?? []
    arr.push(it)
    byProject.set(it.projectName, arr)
  }
  const lines: string[] = []
  lines.push('我把以下多个项目的模块聚合到了同一个工作区，需要联动开发。各项目已软链到当前目录下（以项目名为子目录）：')
  lines.push('')
  for (const [proj, mods] of byProject) {
    lines.push(`- **${proj}/**`)
    for (const m of mods) {
      lines.push(`  - ${m.moduleName}: \`${proj}/${m.moduleRelPath}\``)
    }
  }
  lines.push('')
  lines.push('请先阅读上述模块、理清它们之间的联动关系，再告诉我你的改造方案。')
  return lines.join('\n')
}

/** 右上角项目类型标签：标识当前选中项目是什么工程（Maven / Java Web (传统) / Node …）。 */
function ProjectTypeBadge({ loading, data }: { loading: boolean; data?: ProjectModules }) {
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        识别中
      </Badge>
    )
  }
  if (!data || !data.exists) return null
  return (
    <Badge variant={projectTypeBadge(data.projectType)} className="gap-1">
      <Boxes className="h-3.5 w-3.5" />
      {data.projectTypeLabel || '未知'}
    </Badge>
  )
}

function projectTypeBadge(type?: string) {
  switch (type) {
    case 'maven':
    case 'gradle':
      return 'info'
    case 'node':
      return 'success'
    case 'python':
      return 'warning'
    case 'java-web':
    case 'knowledge':
      return 'secondary'
    default:
      return 'outline'
  }
}

function moduleTypeBadge(type: string) {
  switch (type) {
    case 'maven':
    case 'gradle':
      return 'info'
    case 'node':
      return 'success'
    case 'python':
      return 'warning'
    case 'knowledge':
      return 'secondary'
    default:
      return 'outline'
  }
}

/** 递归过滤模块树：模块自身命中则整支保留；否则保留命中的子模块。 */
function filterModuleTree(modules: ProjectModule[], q: string): ProjectModule[] {
  const hit = (m: ProjectModule) =>
    m.name.toLowerCase().includes(q)
    || m.relPath.toLowerCase().includes(q)
    || m.type.toLowerCase().includes(q)
    || (m.summary ?? '').toLowerCase().includes(q)
  const out: ProjectModule[] = []
  for (const m of modules) {
    if (hit(m)) {
      out.push(m)
      continue
    }
    const kids = filterModuleTree(m.children ?? [], q)
    if (kids.length > 0) out.push({ ...m, children: kids })
  }
  return out
}

function normalizePath(path: string) {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败'
}
