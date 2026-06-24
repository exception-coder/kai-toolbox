import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BotMessageSquare, CornerDownRight, FolderTree, Loader2, Play, RefreshCw, Search, TerminalSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { fetchProjectModules, listSessions, listWorkspaces } from '@/features/claude-chat/api'
import { CHAT_ROUTE, useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import type { ClaudeChatSessionView, ProjectModule, WorkspaceDir } from '@/features/claude-chat/types'

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
      </header>

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

function ModuleCard({
  module,
  sessionByCwd,
  pendingPath,
  onOpen,
}: {
  module: ProjectModule
  sessionByCwd: Map<string, ClaudeChatSessionView>
  pendingPath: string | null
  onOpen: (module: ProjectModule) => void
}) {
  const session = sessionByCwd.get(normalizePath(module.absPath))
  const children = module.children ?? []
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
      <div className="flex justify-end">
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 子模块紧凑行：用于嵌套模块（如 crm 域下的子模块），可独立开会话。 */
function ModuleChildRow({
  module,
  session,
  opening,
  onOpen,
}: {
  module: ProjectModule
  session: ClaudeChatSessionView | undefined
  opening: boolean
  onOpen: () => void
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-[var(--color-muted)]/40 px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="truncate text-sm text-[var(--color-foreground)]">{module.name}</span>
        {session ? <Badge variant="success" className="text-[10px]">会话</Badge> : null}
      </div>
      <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" onClick={onOpen} disabled={opening}>
        {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : session ? <BotMessageSquare className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {session ? '打开' : '新建'}
      </Button>
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
