import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Boxes, BotMessageSquare, Check, ChevronDown, ChevronRight, CornerDownRight, Database, Download, Eye, EyeOff, FileDiff, FolderTree, GitCompare, Info, Loader2, Network, Pencil, Pin, Play, RefreshCw, Search, Sparkles, TerminalSquare, Trash2, X } from 'lucide-react'
import { GitStatusPanel } from '@/components/git/GitStatusPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { getSystemWorkspaceDisplayName } from '@/lib/systemCatalog'
import {
  applyModuleSync,
  createTaskspace,
  ensureKnowledgeBase,
  fetchProjectModules,
  fetchWorkspaceGitFileDiff,
  fetchWorkspaceGitStatus,
  listSessions,
  listProjectDependencies,
  listWorkspaces,
  previewModuleSync,
  replaceProjectDependencies,
  saveProjectAlias,
  type ClaudeChatSessionView,
  type ModuleSyncPreview,
  type ProjectModule,
  type ProjectModules,
  type ProjectDependencyInput,
  type WorkspaceDir,
} from '@/features/claude-chat/public-api'
import { CHAT_ROUTE, useChatRuntime } from '@/features/claude-chat/public-api/runtime'
import {
  engineStatus,
  GRAPHIFY_LABEL,
  GRAPHIFY_TONE,
  REGISTRATION_LABEL,
  REGISTRATION_TONE,
  type ProjectStatusSnapshot,
} from '@/features/knowledge-graph/public-api'
import { GraphifyGraphModal } from '../components/GraphifyGraphModal'
import { ProjectDependenciesDialog } from '../components/ProjectDependenciesDialog'
import { WorkspacePageHeader } from '../components/WorkspacePageHeader'
import { WorkspaceProjectSidebar } from '../components/WorkspaceProjectSidebar'
import { useAggregationCart, type AggregationItem } from '../hooks/useAggregationCart'
import { useStatusCache, type BusinessFilter, type GraphifyFilter } from '../hooks/useStatusCache'
import { useIgnoredProjects, type IgnoreFilter } from '../hooks/useIgnoredProjects'
import { KnowledgeGraphCard } from '../components/KnowledgeGraphCard'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import {
  AggregationCart,
  KnowledgeDirSetup,
  ModuleCard,
  ModuleSyncPanel,
  ProjectTypeBadge,
  StateLine,
  WorkspaceKnowledgeNotice,
} from '../components/WorkspaceSections'
import { buildMenuSyncPrompt, buildModuleScopePrompt } from '../lib/workspacePrompts'
import { buildLinkagePrompt, errorMessage, filterModuleTree, normalizePath } from '../lib/workspaceModel'
import { useWorkspaceAggregation } from '../hooks/useWorkspaceAggregation'
import { useWorkspaceKnowledgeReadiness } from '../hooks/useWorkspaceKnowledgeReadiness'
import { useWorkspaceModuleSync } from '../hooks/useWorkspaceModuleSync'
import { useWorkspaceModuleLaunch } from '../hooks/useWorkspaceModuleLaunch'

/** 知识库根目录配置块 id = WorkspaceProperties 的 @ConfigurationProperties prefix。 */
const WORKSPACE_CFG_ID = 'toolbox.claude-chat.workspace'

/** 记住上次选中的项目路径（跨刷新/进出页面不重置）。 */
const SELECTED_PATH_LS = 'kai-toolbox:project-workspace:selected-path'
const TEAM_KNOWLEDGE_DIR = '~/.kai-toolbox/team-tools/project-domain-knowledge/knowledge'

/** 把检测时间 ISO 格式化为「MM-DD HH:mm」；无效/空返回空串。 */
function fmtCheckedAt(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}


/** 项目工作台：从配置工作区选项目，按确定性模块扫描结果进入对应 Vibe Coding 会话。 */
export function ProjectWorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activate } = useChatRuntime()
  // 记住上次选中的项目（跨刷新/进出页面不重置）
  const [selectedPath, setSelectedPath] = useState(() => {
    try { return localStorage.getItem(SELECTED_PATH_LS) ?? '' } catch { return '' }
  })
  useEffect(() => {
    if (selectedPath) { try { localStorage.setItem(SELECTED_PATH_LS, selectedPath) } catch { /* 隐私模式忽略 */ } }
  }, [selectedPath])
  const [keyword, setKeyword] = useState('')
  const [projectKeyword, setProjectKeyword] = useState('')
  const [ignoredProjectsOpen, setIgnoredProjectsOpen] = useState(false)
  const [aliasEditingPath, setAliasEditingPath] = useState('')
  const [aliasDraft, setAliasDraft] = useState('')
  const [gitChangesProject, setGitChangesProject] = useState<WorkspaceDir | null>(null)
  const [projectDependenciesOpen, setProjectDependenciesOpen] = useState(false)

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
  const projectDependenciesQ = useQuery({
    queryKey: ['project-dependencies', selectedPath],
    queryFn: () => listProjectDependencies(selectedPath),
    enabled: selectedPath.length > 0,
    staleTime: 5000,
  })

  const projects = useMemo(
    () => workspacesQ.data?.roots.flatMap(root => root.dirs.map(dir => ({ ...dir, root: root.root }))) ?? [],
    [workspacesQ.data],
  )
  const selectedProject = projects.find(project => project.path === selectedPath)

  // 跨项目知识图谱状态筛选：懒加载缓存 + 手动「检测全部」（§11.2/11.3）
  const kg = useStatusCache()
  // 忽略项目列表：纯前端偏好，不参与「检测全部」批量检测（§12）
  const ignored = useIgnoredProjects()
  const visibleProjects = useMemo(
    () => {
      const query = projectKeyword.trim().toLowerCase()
      return projects.filter(project => (
        kg.matches(project.path)
        && ignored.matches(project.path)
        && (!query
          || getSystemWorkspaceDisplayName(project).toLowerCase().includes(query)
          || project.name.toLowerCase().includes(query)
          || project.path.toLowerCase().includes(query))
      ))
    },
    [projects, projectKeyword, kg.matches, ignored.matches],
  )
  const activeProjects = visibleProjects.filter(project => !ignored.isIgnored(project.path))
  const ignoredProjects = visibleProjects.filter(project => ignored.isIgnored(project.path))
  const sessions = sessionsQ.data ?? []
  const aliasMutation = useMutation({
    mutationFn: ({ projectPath, alias }: { projectPath: string; alias: string }) => saveProjectAlias(projectPath, alias),
    onSuccess: async () => {
      setAliasEditingPath('')
      await queryClient.invalidateQueries({ queryKey: ['claude-chat-workspaces'] })
    },
  })
  const projectDependenciesMutation = useMutation({
    mutationFn: (dependencies: ProjectDependencyInput[]) => replaceProjectDependencies(selectedPath, dependencies),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-dependencies', selectedPath] })
      setProjectDependenciesOpen(false)
    },
  })
  const sessionByCwd = useMemo(() => {
    const map = new Map<string, ClaudeChatSessionView>()
    sessions.forEach(session => map.set(normalizePath(session.cwd), session))
    return map
  }, [sessions])
  const { launchError, pendingPath, openModule, launchMenuAgent } = useWorkspaceModuleLaunch({
    sessionByCwd,
    selectedProject,
    knowledgeBaseDir: modulesQ.data?.knowledgeBaseDir,
  })
  const { cart, aggregating, error: aggregationError, pinModule, aggregate, clear: clearCart } = useWorkspaceAggregation(selectedProject)
  const filteredModules = useMemo(() => {
    const modules = modulesQ.data?.modules ?? []
    const q = keyword.trim().toLowerCase()
    if (!q) return modules
    return filterModuleTree(modules, q)
  }, [keyword, modulesQ.data?.modules])

  useEffect(() => {
    if (projects.length === 0) return
    // 保留上次选择；仅当未选或所选项目已不在列表（被移除）时回落到第一个
    if (!selectedPath || !projects.some(p => p.path === selectedPath)) setSelectedPath(projects[0].path)
  }, [projects, selectedPath])

  // 打开某项目时，若还没有任何检测历史（缓存无快照）就懒检测一次并记录（含检测时间）；已有历史则直接沿用、不重复检测。
  useEffect(() => {
    if (!selectedPath || kg.isLoading || kg.refreshing) return
    if (ignored.isIgnored(selectedPath)) return
    if (kg.snapshotOf(selectedPath)) return // 已有历史快照，直接展示，不重复检测
    kg.refresh([selectedPath])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, kg.isLoading])

  // ── 跨项目「待聚合」篮子：钉选多项目模块 → 一键聚合为合并工作区联动开发 ──
  // ── 更新项目模块：重新解析目录 → 出 diff → 勾选确认 → 只新增落 modules.json ──
  const [kbCfgOpen, setKbCfgOpen] = useState(false)
  const kbReady = modulesQ.data?.knowledgeDirExists === true
  const rootsOk = useMemo(() => (workspacesQ.data?.roots ?? []).some(r => r.exists), [workspacesQ.data])
  const kbOk = kbReady
  // Graphify 3D 图：仅当所选项目已生成图（graphify-out）才可看
  const [graphOpen, setGraphOpen] = useState(false)
  const graphifyState = kg.snapshotOf(selectedPath)?.graphifyState
  const hasGraphify = graphifyState === 'UP_TO_DATE' || graphifyState === 'STALE'
  // 引擎/两仓就绪检测（含 dist/server.js 是否已构建）。
  const engineQ = useQuery({ queryKey: ['kg-engine-status'], queryFn: engineStatus, staleTime: 5000 })
  const eng = engineQ.data
  const domainOk = eng?.engineBuilt ?? false
  const domainLabel = !eng
    ? '检测中'
    : !eng.domainRepoExists ? '未初始化' : !eng.engineBuilt ? '未构建' : '就绪'
  const crossOk = eng ? (eng.crossRepoExists && eng.engineBuilt) : false
  const crossLabel = !eng
    ? '检测中'
    : !eng.crossRepoExists ? '未初始化' : !eng.engineBuilt ? '引擎未构建' : '就绪'
  // 进入工作台时检查团队初始化生成的固定知识库目录，每个 app 会话只检查一次。
  const { mutation: ensureKbMut, failed: ensureFailed, message: ensureMsg } = useWorkspaceKnowledgeReadiness(
    modulesQ.data?.knowledgeDirExists,
    () => { void modulesQ.refetch() },
  )
  // 「知识库」按钮直接展示固定初始化目录的检查状态。
  const kbBtn = ((): { cls: string; icon: React.ReactNode; label: string } => {
    if (ensureKbMut.isPending) return { cls: 'border-transparent bg-[var(--color-info-soft)] text-[var(--color-info-soft-foreground)]', icon: <Loader2 className="animate-spin" />, label: '知识库 · 检查中' }
    if (kbReady) return { cls: 'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-foreground)]', icon: <Check />, label: '知识库 · 已就绪' }
    return { cls: 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-foreground)]', icon: <AlertTriangle />, label: '知识库 · 未初始化' }
  })()
  const {
    open: syncOpen,
    setOpen: setSyncOpen,
    selected: syncSel,
    message: syncMsg,
    setMessage: setSyncMsg,
    preview: syncPreviewMut,
    apply: syncApplyMut,
    start: openSync,
    close: closeSync,
    toggle: toggleSync,
    toggleAll: toggleSyncAll,
  } = useWorkspaceModuleSync(selectedPath, () => { void modulesQ.refetch() })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <WorkspacePageHeader
        selectedProjectPath={selectedProject?.path}
        modulesLoading={modulesQ.isLoading || (modulesQ.isFetching && !modulesQ.data)}
        modules={modulesQ.data}
        refreshing={workspacesQ.isFetching || modulesQ.isFetching || sessionsQ.isFetching}
        projectDependencyCount={projectDependenciesQ.data?.length ?? 0}
        projectDependenciesLoading={projectDependenciesQ.isLoading}
        dependencies={{
          rootsOk,
          knowledgeBaseOk: kbOk,
          domainOk,
          domainLabel,
          crossProjectOk: crossOk,
          crossProjectLabel: crossLabel,
        }}
        onRefresh={() => {
          void workspacesQ.refetch()
          void modulesQ.refetch()
          void sessionsQ.refetch()
          void projectDependenciesQ.refetch()
        }}
        onOpenProjectDependencies={() => {
          projectDependenciesMutation.reset()
          setProjectDependenciesOpen(true)
        }}
        onOpenWorkspaceConfig={() => navigate(`/tools/config-center?block=${WORKSPACE_CFG_ID}`)}
      />

      {launchError && <StateLine tone="danger" text={`启动交接失败：${launchError}`} />}

      {cart.items.length > 0 && (
        <AggregationCart
          items={cart.items}
          aggregating={aggregating}
          error={aggregationError}
          onRemove={cart.remove}
          onClear={clearCart}
          onAggregate={aggregate}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <WorkspaceProjectSidebar
          source={{
            roots: workspacesQ.data?.roots ?? [],
            loading: workspacesQ.isLoading,
            error: workspacesQ.isError ? workspacesQ.error : null,
            projects,
            visibleProjects,
            activeProjects,
            ignoredProjects,
          }}
          selection={{ selectedPath, keyword: projectKeyword, ignoredOpen: ignoredProjectsOpen }}
          alias={{
            editingPath: aliasEditingPath,
            draft: aliasDraft,
            saving: aliasMutation.isPending,
            error: aliasMutation.isError ? aliasMutation.error : null,
          }}
          statusCache={kg}
          ignored={ignored}
          onKeywordChange={setProjectKeyword}
          onIgnoredOpenChange={setIgnoredProjectsOpen}
          onOpenWorkspaceConfig={() => navigate(`/tools/config-center?block=${WORKSPACE_CFG_ID}`)}
          onShowChanges={setGitChangesProject}
          onEditAlias={(project) => {
            setAliasEditingPath(project.path)
            setAliasDraft(project.alias ?? '')
          }}
          onAliasDraftChange={setAliasDraft}
          onCancelAlias={() => setAliasEditingPath('')}
          onSaveAlias={(project) => aliasMutation.mutate({ projectPath: project.path, alias: aliasDraft })}
          onSelectProject={(project) => {
            setSelectedPath(project.path)
            setKeyword('')
            setSyncOpen(false)
            setSyncMsg(null)
          }}
        />
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TerminalSquare className="h-4 w-4" />
                  模块
                </CardTitle>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap" title="识别到的模块数（筛选后/合计）">
                    <TerminalSquare className="h-3.5 w-3.5" />
                    模块 <b className="font-medium text-[var(--color-foreground)]">
                      {filteredModules.length === (modulesQ.data?.modules.length ?? 0)
                        ? (modulesQ.data?.modules.length ?? 0)
                        : `${filteredModules.length}/${modulesQ.data?.modules.length ?? 0}`}
                    </b>
                  </span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap" title="当前 Vibe Coding 会话数">
                    <BotMessageSquare className="h-3.5 w-3.5" />
                    会话 <b className="font-medium text-[var(--color-foreground)]">{sessions.length}</b>
                  </span>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
                  <Input
                    className="pl-9"
                    value={keyword}
                    onChange={event => setKeyword(event.target.value)}
                    placeholder="搜索模块 / 类型 / 路径"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('shrink-0', kbBtn.cls)}
                  onClick={() => setKbCfgOpen(v => !v)}
                  title="检查团队依赖初始化生成的固定知识库目录"
                >
                  {kbBtn.icon}
                  {kbBtn.label}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={openSync}
                  disabled={!selectedProject || syncPreviewMut.isPending}
                  title="更新模块：支持代码目录扫描和数据库菜单分析"
                >
                  {syncPreviewMut.isPending ? <Loader2 className="animate-spin" /> : <GitCompare />}
                  <span className="hidden lg:inline">更新模块</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setGraphOpen(true)}
                  disabled={!selectedProject || !hasGraphify}
                  title={hasGraphify
                    ? 'Graphify 代码结构图（3D 力导图）'
                    : '该项目暂无 Graphify 图（graphify-out/graph.json）；先在项目里跑 graphify 生成'}
                >
                  <Network />
                  <span className="hidden lg:inline">Graphify 图</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {kbCfgOpen && (
              <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
                    <Database className="h-4 w-4" />团队知识库（全局，所有项目共用）
                  </div>
                  <button type="button" onClick={() => setKbCfgOpen(false)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-2 text-xs text-[var(--color-muted-foreground)]">
                  <b className="text-[var(--color-foreground)]">知识库是本工作台的必备依赖</b>：固定从 <code>{TEAM_KNOWLEDGE_DIR}</code> 读取模块清单与中文业务名；
                  未初始化时只能按目录名识别，且「更新模块」不可用。
                  {modulesQ.data && modulesQ.data.knowledgeDirExists === false && (
                    <b className="text-[var(--color-warning,#b45309)]">　当前初始化目录不存在。</b>
                  )}
                </p>
                <KnowledgeDirSetup onSaved={() => void modulesQ.refetch()} />
              </div>
            )}
            {syncOpen && (
              <ModuleSyncPanel
                pending={syncPreviewMut.isPending}
                error={syncPreviewMut.isError ? errorMessage(syncPreviewMut.error) : null}
                data={syncPreviewMut.data}
                selected={syncSel}
                onToggle={toggleSync}
                onToggleAll={toggleSyncAll}
                applying={syncApplyMut.isPending}
                applyError={syncApplyMut.isError ? errorMessage(syncApplyMut.error) : null}
                onApply={picks => syncApplyMut.mutate(picks)}
                onClose={closeSync}
                onReload={() => syncPreviewMut.mutate()}
                onAnalyzeDatabase={launchMenuAgent}
              />
            )}
            {syncMsg && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-3 py-2 text-sm text-[var(--color-foreground)]">
                <Check className="h-4 w-4 text-[var(--color-primary)]" />
                {syncMsg}
              </div>
            )}
            {ensureKbMut.isPending && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                正在检查团队依赖初始化目录…
              </div>
            )}
            {ensureFailed && (
              <div className="mb-3 space-y-2 rounded-md border border-[var(--color-warning,#b45309)]/50 bg-[var(--color-warning,#b45309)]/10 p-3">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning,#b45309)]" />
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--color-foreground)]">尚未完成团队依赖初始化，当前按目录自动识别</div>
                    <p className="mt-0.5 break-all text-xs text-[var(--color-muted-foreground)]">{ensureMsg}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                      请先到 Vibe Coding 的团队依赖面板完成初始化，再回来重新检查。
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button type="button" size="sm" onClick={() => ensureKbMut.mutate()} disabled={ensureKbMut.isPending}>
                      <RefreshCw className={cn(ensureKbMut.isPending && 'animate-spin')} />重试
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setKbCfgOpen(true)}>查看目录</Button>
                  </div>
                </div>
              </div>
            )}
            {!ensureKbMut.isPending && !ensureFailed && !syncOpen && modulesQ.data?.exists && (
              <WorkspaceKnowledgeNotice
                data={modulesQ.data}
                onSaved={() => void modulesQ.refetch()}
                onOpenSync={openSync}
              />
            )}
            {selectedProject && !syncOpen && (
              <div className="mb-3">
                <KnowledgeGraphCard
                  projectPath={selectedProject.path}
                  projectName={selectedProject.name}
                  snapshot={kg.snapshotOf(selectedProject.path)}
                />
              </div>
            )}
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
                {filteredModules.map((module, i) => (
                  <ModuleCard
                    key={`${module.relPath}|${module.name}|${i}`}
                    module={module}
                    sessionByCwd={sessionByCwd}
                    pendingPath={pendingPath}
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

      <GraphifyGraphModal
        open={graphOpen}
        projectPath={selectedPath}
        projectName={selectedProject?.name ?? ''}
        onClose={() => setGraphOpen(false)}
      />
      {projectDependenciesOpen && selectedProject && (
        <ProjectDependenciesDialog
          primaryProject={selectedProject}
          projects={projects}
          dependencies={projectDependenciesQ.data ?? []}
          loading={projectDependenciesQ.isLoading}
          saving={projectDependenciesMutation.isPending}
          loadError={projectDependenciesQ.isError ? errorMessage(projectDependenciesQ.error) : null}
          saveError={projectDependenciesMutation.isError ? errorMessage(projectDependenciesMutation.error) : null}
          onRetry={() => { void projectDependenciesQ.refetch() }}
          onSave={dependencies => projectDependenciesMutation.mutate(dependencies)}
          onClose={() => !projectDependenciesMutation.isPending && setProjectDependenciesOpen(false)}
        />
      )}
      {gitChangesProject && (
        <GitStatusPanel
          title={getSystemWorkspaceDisplayName(gitChangesProject)}
          fetchStatus={() => fetchWorkspaceGitStatus(gitChangesProject.path)}
          fetchFileDiff={(filePath, x) => fetchWorkspaceGitFileDiff(gitChangesProject.path, filePath, x)}
          onClose={() => setGitChangesProject(null)}
        />
      )}
    </div>
  )
}
