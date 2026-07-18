import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Boxes, BotMessageSquare, Check, Compass, CornerDownRight, Database, Download, Eye, EyeOff, FolderTree, GitCompare, Info, Loader2, Pin, Play, RefreshCw, Search, Send, Sparkles, TerminalSquare, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { applyModuleSync, createTaskspace, ensureKnowledgeBase, fetchProjectModules, listSessions, listWorkspaces, previewModuleSync, resolveModule } from '@/features/claude-chat/api'
import { getConfigBlock, updateConfigBlock } from '@/features/config-center/api'
import { VoiceInputButton } from '@/features/claude-chat/components/VoiceInputButton'
import { CHAT_ROUTE, useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import type { ClaudeChatSessionView, ModuleCandidate, ModuleSyncPreview, ProjectModule, ProjectModules, WorkspaceDir } from '@/features/claude-chat/types'
import { GRAPHIFY_LABEL, GRAPHIFY_TONE, REGISTRATION_LABEL, REGISTRATION_TONE } from '@/features/knowledge-graph/components/DomainKnowledgeCard'
import type { ProjectStatusSnapshot } from '@/features/knowledge-graph/types'
import { AGGREGATION_DRAFT_KEY, useAggregationCart, type AggregationItem } from '../hooks/useAggregationCart'
import { useStatusCache, type BusinessFilter, type GraphifyFilter } from '../hooks/useStatusCache'
import { useIgnoredProjects, type IgnoreFilter } from '../hooks/useIgnoredProjects'
import { KnowledgeGraphCard } from '../components/KnowledgeGraphCard'

interface PendingOpen {
  module: ProjectModule
  sessionId: string | null
}

/** 知识库根目录配置块 id = WorkspaceProperties 的 @ConfigurationProperties prefix。 */
const WORKSPACE_CFG_ID = 'toolbox.claude-chat.workspace'


/** 从配置块中取出知识库路径（knowledge-base-dir）的当前值；未配置为空串。 */
function readKnowledgeDir(entries?: { key: string; value: string | null }[]) {
  const e = (entries ?? []).find(x => x.key.toLowerCase().includes('knowledge-base-dir') || x.key.toLowerCase().includes('knowledgebasedir'))
  return (e?.value ?? '').trim()
}

/** 进入工作台自动「确保知识库就绪」只尝试一次（跨路由切换不重复触发 git clone）。 */
let knowledgeEnsureTried = false

/** sessionStorage handoff key：项目工作台「Agent 识菜单」→ 会话页拉起 Claude 跑菜单识别闭环。 */
const MENU_SYNC_LAUNCH_KEY = 'kai-toolbox:claude-chat:module-sync-launch'

/** sessionStorage handoff key：新建模块会话时把本模块 codePath/webPath 编码范围预填进输入框。 */
const MODULE_OPEN_CONTEXT_KEY = 'kai-toolbox:claude-chat:module-open-context'

/**
 * 新建模块会话时的「编码范围前言」：把本模块的前端/后端目录带进提示词约束改动范围。
 * 有 codePath 或 webPath 才生成；末尾留「需求：」让用户接着写。无范围信息则返回空串（不预填）。
 */
function buildModuleScopePrompt(module: ProjectModule): string {
  const web = (module.webPath ?? '').trim()
  const code = (module.codePath ?? '').trim()
  if (!web && !code) return ''
  const lines = [`【本次工作模块：${module.name}】`]
  if (module.summary?.trim()) lines.push(module.summary.trim())
  lines.push('改动请优先落在本模块目录内：')
  if (web) lines.push(`- 前端：${web}`)
  if (code) lines.push(`- 后端：${code}`)
  lines.push('若确实需要改动这两个目录之外的类（如公共库 / 共享 / 跨模块的类），先列出涉及了哪些外部类及原因，我确认后再改——不要擅自扩大范围，也不必因此卡住。')
  lines.push('', '需求：')
  return lines.join('\n')
}

/**
 * 「按菜单识别模块」投喂给 Claude 会话的提示：agent 从菜单权威来源（数据库动态菜单优先查库，否则读路由/配置/初始化 SQL）
 * 识别业务模块，经 domain-knowledge 的 add-modules 落盘。刻意先预览、owner 确认后再 --apply，
 * 守住「内容 agent 产、脚本只确定性落盘」的红线。
 */
function buildMenuSyncPrompt(project: string, projectPath: string, kbRepo: string): string {
  return [
    `我要更新知识库里「${project}」的模块清单（modules.json），按【前端菜单/路由】识别业务模块（不是按代码目录名）。请按下面步骤，务必保留我的确认关卡：`,
    '',
    `1. 先判断本项目（当前工作目录：${projectPath}）的菜单是【数据库动态配置】还是【代码/文件静态声明】，据此选权威来源识别业务模块：`,
    '   ① 数据库动态菜单（很多后台系统如此，务必先确认是不是这种）——数据库是唯一权威来源，优先于代码/文件：',
    '      去查菜单表（sys_menu / 权限菜单 / *_menu 等）拿真实菜单树。用项目里的数据库连接配置（datasource / jdbc / 配置文件）+',
    '      本会话可用的数据库查询工具（如挂载的 *_db query MCP，没有就用项目自带的 SQL 客户端/连接）执行 SQL 读取。',
    '      ⚠️ 不要只扫代码目录/文件就下结论——动态菜单不查库会漏或错。',
    '   ② 静态声明：sys_menu 初始化 SQL（如 yudao 的 sys_menu.sql）、Struts/SpringMVC 的 *.xml 路由、',
    '      React 的 src/shell/featureRegistry·路由表(router/routes)·各 feature 的 index 清单；',
    '   ③ 两者都有时以数据库为准，代码/文件仅作补充（用来补 codePath/webPath）。',
    '   每个业务模块产出一条 JSON：{ "key": "英文短标识", "name": "中文业务名", "codePath": "后端代码目录(相对项目根)", "webPath": "前端目录或路由(相对项目根)" }。',
    '   注：菜单表通常只给菜单名 + URL/权限标识，codePath/webPath 需你结合菜单 URL 与代码结构推导；拿不准的先留空，别硬编。',
    '',
    '2. 先【预览】，不要直接写盘。到知识库仓执行（注意是 domain-knowledge 仓，不是本项目）：',
    `   cd ${kbRepo || '<project-domain-knowledge 仓根>'}`,
    `   把 JSON 数组通过 stdin 或 --from 临时文件喂给（不加 --apply = 预览）：node scripts/bootstrap.mjs add-modules --project ${project}`,
    '',
    '3. 把预览结果（新增 / 去重跳过 / 缺字段）贴给我，等我确认后，再对同一条命令加 --apply 落盘。',
    '',
    '4. 落盘成功后提醒我：npm run catalog 刷新目录，MCP 端 reload_knowledge 生效。',
    '',
    '红线：模块内容由你识别产出、我（owner）评审确认；add-modules 只做确定性落盘（只新增/去重/保格式），不要让脚本从代码抽内容硬塞，也不要跳过我的确认直接 --apply。',
  ].join('\n')
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

  // 跨项目知识图谱状态筛选：懒加载缓存 + 手动「检测全部」（§11.2/11.3）
  const kg = useStatusCache()
  // 忽略项目列表：纯前端偏好，不参与「检测全部」批量检测（§12）
  const ignored = useIgnoredProjects()
  const visibleProjects = useMemo(
    () => projects.filter(p => kg.matches(p.path) && ignored.matches(p.path)),
    [projects, kg.matches, ignored.matches],
  )
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
    // 仅新建会话时，把本模块编码范围（前端/后端目录）预填进输入框；已有会话不打扰
    if (!next.sessionId) {
      const seed = buildModuleScopePrompt(module)
      try {
        if (seed) sessionStorage.setItem(MODULE_OPEN_CONTEXT_KEY, seed)
        else sessionStorage.removeItem(MODULE_OPEN_CONTEXT_KEY)
      } catch { /* 隐私模式忽略 */ }
    }
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

  // ── 更新项目模块：重新解析目录 → 出 diff → 勾选确认 → 只新增落 modules.json ──
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncSel, setSyncSel] = useState<Set<string>>(new Set())
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [kbCfgOpen, setKbCfgOpen] = useState(false)
  const qc = useQueryClient()
  const kbBlockQ = useQuery({ queryKey: ['config-block', WORKSPACE_CFG_ID], queryFn: () => getConfigBlock(WORKSPACE_CFG_ID), staleTime: 5000 })
  // 知识库是否已配置（路径非空）；驱动「必需配置」提醒，读运行时配置中心、不依赖后端重启
  const kbConfigured = useMemo(() => readKnowledgeDir(kbBlockQ.data?.entries).length > 0, [kbBlockQ.data])
  const kbKnown = kbBlockQ.isSuccess
  // 自动确保知识库就绪：进工作台时若 knowledge 目录不存在，后端自动 clone 到用户目录并绑定——无需用户点击。
  // 每个 app 会话只自动试一次（失败给「重试」，避免反复 git clone）。
  const ensureKbMut = useMutation({
    mutationFn: ensureKnowledgeBase,
    onSuccess: res => {
      if (res.status === 'ok' || res.status === 'bound' || res.status === 'cloned') {
        void qc.invalidateQueries({ queryKey: ['config-block', WORKSPACE_CFG_ID] })
        void modulesQ.refetch()
      }
    },
  })
  useEffect(() => {
    if (knowledgeEnsureTried || !kbKnown) return // 等配置读出来再判断
    // 完全没配 → 立即自动拉取
    if (!kbConfigured) { knowledgeEnsureTried = true; ensureKbMut.mutate(); return }
    // 已配置 → 等模块扫描回来看路径是否有效：目录不存在(配错/失效)也自动拉取重绑；有效则确认就绪不再触发
    const dirExists = modulesQ.data?.knowledgeDirExists
    if (dirExists === false) { knowledgeEnsureTried = true; ensureKbMut.mutate() }
    else if (dirExists === true) { knowledgeEnsureTried = true } // 确认就绪
    // dirExists === undefined（模块尚未扫描/后端旧版）：先不决定，等下次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbKnown, kbConfigured, modulesQ.data?.knowledgeDirExists])
  const ensureFailed = !ensureKbMut.isPending
    && (ensureKbMut.isError || ensureKbMut.data?.status === 'error' || ensureKbMut.data?.status === 'disabled')
  const ensureMsg = ensureKbMut.data?.message || errorMessage(ensureKbMut.error)
  // 「知识库」按钮的状态外观：配置中(蓝) / 已就绪(绿) / 拉取失败(红) / 未配置·路径无效(琥珀)——让按钮本身就是状态标识
  const kbBtn = ((): { cls: string; icon: React.ReactNode; label: string } => {
    if (ensureKbMut.isPending) return { cls: 'border-transparent bg-[var(--color-info-soft)] text-[var(--color-info-soft-foreground)]', icon: <Loader2 className="animate-spin" />, label: '知识库 · 配置中' }
    if (!kbKnown) return { cls: '', icon: <Database />, label: '知识库' }
    if (ensureFailed) return { cls: 'border-transparent bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]', icon: <AlertTriangle />, label: '知识库 · 拉取失败' }
    if (kbConfigured && modulesQ.data?.knowledgeDirExists !== false) return { cls: 'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-foreground)]', icon: <Check />, label: '知识库 · 已就绪' }
    return { cls: 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-foreground)]', icon: <AlertTriangle />, label: kbConfigured ? '知识库 · 路径无效' : '知识库 · 未配置' }
  })()
  const syncPreviewMut = useMutation({ mutationFn: () => previewModuleSync(selectedPath) })
  const syncApplyMut = useMutation({
    mutationFn: (picks: { key: string; codePath: string }[]) => applyModuleSync(selectedPath, picks),
    onSuccess: result => {
      setSyncMsg(`已追加 ${result.appended} 个模块${result.skipped ? `（跳过 ${result.skipped}）` : ''}`)
      setSyncOpen(false)
      void modulesQ.refetch()
    },
  })
  // 「Agent 识菜单」：拉起 Claude 会话（cwd=目标项目）跑菜单识别闭环，产出清单经 add-modules 落知识库
  const launchMenuAgent = () => {
    if (!selectedProject) return
    const kbRepo = readKnowledgeDir(kbBlockQ.data?.entries).replace(/[\\/]knowledge[\\/]?$/, '')
    const seed = buildMenuSyncPrompt(selectedProject.name, selectedProject.path, kbRepo)
    try {
      sessionStorage.setItem(MENU_SYNC_LAUNCH_KEY, JSON.stringify({ cwd: selectedProject.path, seed }))
    } catch { /* 隐私模式忽略 */ }
    activate()
    navigate(CHAT_ROUTE)
  }

  const openSync = () => {
    setSyncMsg(null)
    setSyncSel(new Set())
    setSyncOpen(true)
    syncPreviewMut.reset()
    syncApplyMut.reset()
    syncPreviewMut.mutate()
  }
  const closeSync = () => setSyncOpen(false)
  const toggleSync = (codePath: string) =>
    setSyncSel(prev => {
      const next = new Set(prev)
      if (next.has(codePath)) next.delete(codePath)
      else next.add(codePath)
      return next
    })
  const toggleSyncAll = (codePaths: string[]) =>
    setSyncSel(prev => (prev.size >= codePaths.length ? new Set() : new Set(codePaths)))

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

      <div className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          本工作台依赖两项<b className="text-[var(--color-foreground)]">运行时配置</b>（配置中心 →「Claude 工作目录」，改后即时生效、无需重启）：
          左侧<b className="text-[var(--color-foreground)]">项目列表</b>来自 <code>workspace.roots</code>；
          <b className="text-[var(--color-foreground)]">模块清单/中文名</b>来自 <code>knowledge-base-dir</code>（未配置会自动从 Git 拉取知识库）。
          没加载出来多半是这两项没配好。
          <button type="button" className="ml-1 font-medium text-[var(--color-primary)] hover:underline" onClick={() => navigate(`/tools/config-center?block=${WORKSPACE_CFG_ID}`)}>
            去配置 →
          </button>
        </span>
      </div>

      <Card>
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="h-4 w-4" />
            模块路由
          </CardTitle>
          <CardDescription>
            说一句话直达：「去开发销售模块」「yoooni 的 生产管理」——自动定位项目 + 模块并拉起会话
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
              placeholder="例如：去开发销售模块 / yoooni 的 生产管理"
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
                未匹配到模块「{routeHint}」。换个模块名，或带上项目名（如「yoooni 的 生产管理」）再试。
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
            <CardDescription>来自 Vibe Coding 工作区配置（workspace.roots）</CardDescription>
            <KnowledgeGraphFilterBar
              kg={kg}
              ignored={ignored}
              onRefreshAll={() => kg.refresh(projects.filter(p => !ignored.isIgnored(p.path)).map(p => p.path))}
            />
            {(workspacesQ.data?.roots?.length ?? 0) > 0 && (
              <div className="mt-1.5 space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-2">
                <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">当前扫描目录</div>
                {workspacesQ.data!.roots.map(r => (
                  <div key={r.root} className="flex items-center gap-1.5 text-[11px]" title={r.root}>
                    {r.exists
                      ? <Check className="h-3 w-3 shrink-0 text-[var(--color-success-soft-foreground,#16a34a)]" />
                      : <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--color-warning,#b45309)]" />}
                    <code className="truncate text-[var(--color-foreground)]">{r.root || '(空)'}</code>
                    {!r.exists && <span className="shrink-0 text-[var(--color-warning,#b45309)]">不存在</span>}
                  </div>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {workspacesQ.isLoading ? (
              <StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="正在读取项目" />
            ) : workspacesQ.isError ? (
              <StateLine tone="danger" text={errorMessage(workspacesQ.error)} />
            ) : projects.length === 0 ? (
              <div className="space-y-2 rounded-md border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted-foreground)]">
                <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-foreground)]">
                  <AlertTriangle className="h-4 w-4 text-[var(--color-warning,#b45309)]" />
                  没有可用项目
                </div>
                <p>
                  项目列表来自配置项 <code>toolbox.claude-chat.workspace.roots</code>（工作区扫描根目录）。
                  当前它{(workspacesQ.data?.roots?.length ?? 0) > 0 ? '下没有扫描到子目录——检查路径是否存在/写对' : '还未配置'}。
                </p>
                <p>去「配置中心 → Claude 工作目录」把你的代码目录（如 <code>D:\Users\你\myWork</code>）加进 roots，保存即时生效、无需重启。</p>
                <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/tools/config-center?block=${WORKSPACE_CFG_ID}`)}>
                  <Database className="h-3.5 w-3.5" />去配置工作区目录
                </Button>
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
                <span>没有项目匹配当前的知识图谱筛选条件</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => { kg.setGraphifyFilter('ALL'); kg.setBusinessFilter('ALL'); ignored.setFilter('ALL') }}>
                  清除筛选
                </Button>
              </div>
            ) : (
              visibleProjects.map(project => (
                <ProjectButton
                  key={project.path}
                  project={project}
                  selected={project.path === selectedPath}
                  snapshot={kg.snapshotOf(project.path)}
                  ignored={ignored.isIgnored(project.path)}
                  onToggleIgnore={() => ignored.toggle(project.path)}
                  onClick={() => {
                    setSelectedPath(project.path)
                    setKeyword('')
                    setSyncOpen(false)
                    setSyncMsg(null)
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>

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
                  title="知识库是本工作台的必备依赖（提供模块清单/中文名）。点击查看状态与配置；未就绪时首次进入会自动拉取。"
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
                  title="源码模式：按代码目录重新解析模块，与 modules.json 出差异，确认后只新增"
                >
                  {syncPreviewMut.isPending ? <Loader2 className="animate-spin" /> : <GitCompare />}
                  <span className="hidden lg:inline">更新模块</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={launchMenuAgent}
                  disabled={!selectedProject || !kbConfigured}
                  title={kbConfigured
                    ? '菜单模式：拉起 Claude 会话按前端菜单/路由识别业务模块（带中文名），预览确认后经 add-modules 落知识库'
                    : '需先配置知识库路径'}
                >
                  <Sparkles />
                  <span className="hidden lg:inline">Agent 识菜单</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {kbCfgOpen && (
              <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
                    <Database className="h-4 w-4" />知识库配置（全局，所有项目共用）
                  </div>
                  <button type="button" onClick={() => setKbCfgOpen(false)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-2 text-xs text-[var(--color-muted-foreground)]">
                  <b className="text-[var(--color-foreground)]">知识库是本工作台的必备依赖</b>：按 <code>{'{知识库}/{项目名}/impl/modules.json'}</code> 读取每个项目的模块清单与中文业务名；
                  未配置时只能按目录名识别，且「更新模块 / Agent 识菜单」不可用。
                  {modulesQ.data && modulesQ.data.knowledgeDirExists === false && (
                    <b className="text-[var(--color-warning,#b45309)]">　当前路径不存在或未配置。</b>
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
                正在自动准备知识库（首次会 git clone 到用户目录，请稍候）…
              </div>
            )}
            {ensureFailed && (
              <div className="mb-3 space-y-2 rounded-md border border-[var(--color-warning,#b45309)]/50 bg-[var(--color-warning,#b45309)]/10 p-3">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning,#b45309)]" />
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--color-foreground)]">知识库自动拉取未成功，当前按目录自动识别</div>
                    <p className="mt-0.5 break-all text-xs text-[var(--color-muted-foreground)]">{ensureMsg}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                      多为<b className="text-[var(--color-foreground)]">未登录企业 Git 账号</b>——请先在终端 <code>git</code> 登录（或配好 Gitee 凭据），再点重试。
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button type="button" size="sm" onClick={() => ensureKbMut.mutate()} disabled={ensureKbMut.isPending}>
                      <RefreshCw className={cn(ensureKbMut.isPending && 'animate-spin')} />重试
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setKbCfgOpen(true)}>手动配置</Button>
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

function ProjectButton({
  project,
  selected,
  snapshot,
  ignored,
  onToggleIgnore,
  onClick,
}: {
  project: WorkspaceDir & { root: string }
  selected: boolean
  snapshot?: ProjectStatusSnapshot
  ignored: boolean
  onToggleIgnore: () => void
  onClick: () => void
}) {
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
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {ignored ? (
          <StatusBadge tone="neutral" className="px-1.5 py-0 text-[10px]">已忽略</StatusBadge>
        ) : (
          <>
            <StatusBadge
              tone={snapshot?.graphifyState ? GRAPHIFY_TONE[snapshot.graphifyState] : 'neutral'}
              className="px-1.5 py-0 text-[10px]"
            >
              {snapshot?.graphifyState ? GRAPHIFY_LABEL[snapshot.graphifyState] : '未检测'}
            </StatusBadge>
            <StatusBadge
              tone={snapshot?.businessGraphState ? REGISTRATION_TONE[snapshot.businessGraphState] : 'neutral'}
              className="px-1.5 py-0 text-[10px]"
            >
              {snapshot?.businessGraphState ? REGISTRATION_LABEL[snapshot.businessGraphState] : '未检测'}
            </StatusBadge>
          </>
        )}
        <button
          type="button"
          className="ml-auto shrink-0 rounded p-0.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          title={ignored ? '取消忽略：恢复参与「检测全部」' : '忽略：不参与「检测全部」批量知识图谱检测'}
          onClick={(e) => { e.stopPropagation(); onToggleIgnore() }}
        >
          {ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      </div>
    </button>
  )
}

/**
 * 左侧项目列表上方的知识图谱区：Graphify / 业务图谱两个知识源各一行 chips，纵向堆叠、可换行，
 * 不做「数据源 × 状态」二维矩阵（避免读成后台筛选表格）。选中态用实心高亮，其余弱化。
 */
function KnowledgeGraphFilterBar({
  kg,
  ignored,
  onRefreshAll,
}: {
  kg: ReturnType<typeof useStatusCache>
  ignored: ReturnType<typeof useIgnoredProjects>
  onRefreshAll: () => void
}) {
  const graphifyOptions: { value: GraphifyFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'UNCHECKED', label: '未检测' },
    { value: 'NOT_GENERATED', label: '未生成' },
    { value: 'STALE', label: '已过时' },
    { value: 'UP_TO_DATE', label: '最新' },
  ]
  const businessOptions: { value: BusinessFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'UNCHECKED', label: '未检测' },
    { value: 'NOT_REGISTERED', label: '未登记' },
    { value: 'PARTIAL', label: '部分' },
    { value: 'REGISTERED', label: '已登记' },
  ]
  const ignoreOptions: { value: IgnoreFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'NOT_IGNORED', label: '未忽略' },
    { value: 'IGNORED', label: '已忽略' },
  ]
  return (
    <div className="mt-2 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-foreground)]">知识图谱</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-50"
          disabled={kg.refreshing}
          onClick={onRefreshAll}
          title="并发检测当前项目列表的 Graphify + 业务图谱状态，写入本地缓存"
        >
          {kg.refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          检测全部
        </button>
      </div>
      <FilterChipRow label="Graphify" value={kg.graphifyFilter} onChange={kg.setGraphifyFilter} options={graphifyOptions} />
      <FilterChipRow label="业务图谱" value={kg.businessFilter} onChange={kg.setBusinessFilter} options={businessOptions} />
      {kg.refreshError && <p className="text-[11px] text-[var(--color-destructive)]">{kg.refreshError}</p>}
      <div className="border-t border-[var(--color-border)] pt-2">
        <FilterChipRow label="忽略状态" value={ignored.filter} onChange={ignored.setFilter} options={ignoreOptions} />
      </div>
    </div>
  )
}

/** 单个知识源一行：名称独占一行 + 下方可换行的 chips，选中态高亮，替代 Segmented 单行硬挤五个选项。 */
function FilterChipRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-[var(--color-muted-foreground)]">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                active
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
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
          {children.map((child, ci) => (
            <ModuleChildRow
              key={`${child.relPath}|${child.name}|${ci}`}
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

/** 「更新项目模块」diff 面板：展示新增候选（可勾选）+ 已消失告警，确认后只新增落 modules.json。 */
function ModuleSyncPanel({
  pending,
  error,
  data,
  selected,
  onToggle,
  onToggleAll,
  applying,
  applyError,
  onApply,
  onClose,
  onReload,
}: {
  pending: boolean
  error: string | null
  data?: ModuleSyncPreview
  selected: Set<string>
  onToggle: (codePath: string) => void
  onToggleAll: (codePaths: string[]) => void
  applying: boolean
  applyError: string | null
  onApply: (picks: { key: string; codePath: string }[]) => void
  onClose: () => void
  onReload: () => void
}) {
  if (pending) {
    return <SyncPanelShell onClose={onClose}><StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="正在解析项目目录…" /></SyncPanelShell>
  }
  if (error) return <SyncPanelShell onClose={onClose}><StateLine tone="danger" text={error} /></SyncPanelShell>
  if (!data) return null
  if (!data.exists) return <SyncPanelShell onClose={onClose}><StateLine tone="danger" text="项目不存在或不在允许的工作区根内" /></SyncPanelShell>
  if (!data.knowledgeConfigured) {
    // 知识库根目录没配 / 路径不存在 → 让用户填写知识图谱项目路径
    if (!data.knowledgeDirExists) {
      return (
        <SyncPanelShell onClose={onClose}>
          <div className="space-y-2.5 text-sm text-[var(--color-muted-foreground)]">
            <p>
              此功能依赖<b className="text-[var(--color-foreground)]">知识图谱项目</b>（<code>project-domain-knowledge</code> 的本地 clone）——
              模块清单 <code>modules.json</code> 由它维护。当前
              {data.knowledgeBaseDir
                ? <>配置的知识库路径 <code className="break-all">{data.knowledgeBaseDir}</code> <b className="text-[var(--color-destructive)]">不存在</b>。</>
                : <>还没配置知识库路径。</>}
            </p>
            <KnowledgeDirSetup onSaved={onReload} saveLabel="保存并重试" />
          </div>
        </SyncPanelShell>
      )
    }
    // 知识库路径 OK，只是该项目还没生成清单 → 给 CLI 初始化命令
    return (
      <SyncPanelShell onClose={onClose}>
        <div className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
          <p>知识库已配置，但该项目还没有 <code>modules.json</code>。首次初始化需指定代码基准目录，在知识库仓根执行：</p>
          <pre className="overflow-x-auto rounded bg-[var(--color-muted)]/50 p-2 text-xs text-[var(--color-foreground)]">cd {data.knowledgeBaseDir.replace(/[\\/]knowledge[\\/]?$/, '') || '<project-domain-knowledge 仓根>'}
node scripts/bootstrap.mjs sync-modules --project {data.project} --project-root {data.projectPath} --code-base &lt;相对路径,逗号分隔&gt; --apply</pre>
          <p>生成后回到这里点「更新模块」即可增量维护，无需再手敲。</p>
        </div>
      </SyncPanelShell>
    )
  }
  const selectable = data.added.filter(a => !a.keyConflict).map(a => a.codePath)
  const picks = data.added.filter(a => selected.has(a.codePath)).map(a => ({ key: a.key, codePath: a.codePath }))
  return (
    <SyncPanelShell onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-[var(--color-muted-foreground)]">现有 {data.currentCount} 条 · 新增候选 {data.added.length} · 已选 {picks.length}</span>
          {selectable.length > 0 && (
            <button type="button" className="text-xs text-[var(--color-primary)] hover:underline" onClick={() => onToggleAll(selectable)}>
              {selected.size >= selectable.length ? '全不选' : '全选可选'}
            </button>
          )}
        </div>
        {data.added.length === 0 ? (
          <StateLine text="没有新增模块，清单已与代码目录一致" />
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {data.added.map(a => (
              <label
                key={a.codePath}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                  a.keyConflict ? 'opacity-60' : 'cursor-pointer hover:bg-[var(--color-accent)]',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--color-primary)]"
                  checked={selected.has(a.codePath)}
                  disabled={a.keyConflict}
                  onChange={() => onToggle(a.codePath)}
                />
                <span className="shrink-0 font-medium text-[var(--color-foreground)]">{a.key}</span>
                {a.keyConflict && <Badge variant="warning" className="shrink-0 text-[10px]">key 冲突</Badge>}
                <span className="truncate text-xs text-[var(--color-muted-foreground)]">{a.codePath}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--color-muted-foreground)]">
          追加为骨架条目（name / webPath 留空），落盘后请补业务名与前端目录；技术目录（如 common/excel）别勾。
        </p>
        {data.missing.length > 0 && (
          <div className="space-y-0.5 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-2 text-xs text-[var(--color-muted-foreground)]">
            <div className="mb-1 flex items-center gap-1 text-[var(--color-destructive)]">
              <AlertTriangle className="h-3.5 w-3.5" />目录已消失（{data.missing.length}）— 只告警，不自动删除
            </div>
            {data.missing.map(m => <div key={m.codePath} className="truncate">· {m.key}「{m.name}」({m.codePath})</div>)}
          </div>
        )}
        {applyError && <p className="text-sm text-[var(--color-destructive)]">{applyError}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button type="button" size="sm" disabled={picks.length === 0 || applying} onClick={() => onApply(picks)}>
            {applying ? <Loader2 className="animate-spin" /> : <Check />}
            应用所选（{picks.length}）
          </Button>
        </div>
      </div>
    </SyncPanelShell>
  )
}

/**
 * 工作台级提示：进项目就主动告知知识图谱配置状态,把"填知识库路径"提到 UI 层,而不是藏在「更新模块」里。
 * - 知识库没配/路径不存在 → 醒目横幅 + 就地填路径(保存即生效、重扫)；
 * - 路径 OK 但该项目未纳入清单(走了自动识别) → 轻量提示,引导点「更新模块」生成。
 */
function WorkspaceKnowledgeNotice({
  data,
  onSaved,
  onOpenSync,
}: {
  data: ProjectModules
  onSaved: () => void
  onOpenSync: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const blockQ = useQuery({ queryKey: ['config-block', WORKSPACE_CFG_ID], queryFn: () => getConfigBlock(WORKSPACE_CFG_ID), staleTime: 5000 })
  const kbConfigured = readKnowledgeDir(blockQ.data?.entries).length > 0

  // ① 必需项未配置（路径为空）——友好提醒，读配置中心、不依赖后端重启
  if (blockQ.isSuccess && !kbConfigured) {
    return (
      <div className="mb-3 space-y-2 rounded-md border border-[var(--color-warning,#b45309)]/50 bg-[var(--color-warning,#b45309)]/10 p-3">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning,#b45309)]" />
          <div className="min-w-0">
            <div className="font-medium text-[var(--color-foreground)]">请先配置知识库（必需项，全局只需设置一次）</div>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              「项目工作台」的模块中文名、模块清单维护都依赖<b className="text-[var(--color-foreground)]">知识图谱项目</b>（<code>project-domain-knowledge</code>）。
              当前尚未配置，只能按目录名自动识别。请检查并设置一次 knowledge 目录路径。
            </p>
          </div>
          <Button type="button" size="sm" className="shrink-0" onClick={() => setExpanded(v => !v)}>
            {expanded ? '收起' : '去配置'}
          </Button>
        </div>
        {expanded && <KnowledgeDirSetup onSaved={onSaved} saveLabel="保存" />}
      </div>
    )
  }

  // ② 配了路径、但后端探测该目录不存在（需后端新字段；旧后端为 undefined 不误报）
  if (data.knowledgeDirExists === false) {
    return (
      <div className="mb-3 space-y-2 rounded-md border border-[var(--color-warning,#b45309)]/40 bg-[var(--color-warning,#b45309)]/5 p-3">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning,#b45309)]" />
          <div className="min-w-0">
            <div className="font-medium text-[var(--color-foreground)]">知识库路径无效，当前按目录自动识别</div>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              配置的 <code className="break-all">{data.knowledgeBaseDir || '(空)'}</code> 在磁盘上不存在。请检查是否已 <code>git clone</code> 知识库、路径是否写对。
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setExpanded(v => !v)}>
            {expanded ? '收起' : '检查配置'}
          </Button>
        </div>
        {expanded && <KnowledgeDirSetup onSaved={onSaved} saveLabel="保存并重试" />}
      </div>
    )
  }
  if (data.exists && data.fromKnowledge === false) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        <span>该项目暂未纳入知识图谱清单，当前按目录自动识别（模块名=目录名）。</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={onOpenSync}>
          <GitCompare className="h-3.5 w-3.5" />生成清单
        </Button>
      </div>
    )
  }
  return null
}

/**
 * 就地查看/填写「知识图谱项目」的 knowledge 目录路径；当前值直接读运行时配置中心（不依赖后端是否已升级），
 * 保存也写配置中心，无需重启，保存后回调（重扫模块）。saveLabel 让不同入口用不同措辞。
 */
function KnowledgeDirSetup({ onSaved, saveLabel = '保存' }: { onSaved: () => void; saveLabel?: string }) {
  const qc = useQueryClient()
  const blockQ = useQuery({ queryKey: ['config-block', WORKSPACE_CFG_ID], queryFn: () => getConfigBlock(WORKSPACE_CFG_ID) })
  const entry = useMemo(
    () => (blockQ.data?.entries ?? []).find(e => e.key.toLowerCase().includes('knowledge-base-dir') || e.key.toLowerCase().includes('knowledgebasedir')),
    [blockQ.data],
  )
  const entryKey = entry?.key ?? `${WORKSPACE_CFG_ID}.knowledge-base-dir`
  const [path, setPath] = useState('')
  const [dirty, setDirty] = useState(false)
  useEffect(() => { if (!dirty && entry) setPath(entry.value ?? '') }, [entry, dirty])

  const afterBind = () => { void qc.invalidateQueries({ queryKey: ['config-block', WORKSPACE_CFG_ID] }); setDirty(false); onSaved() }
  const saveMut = useMutation({
    mutationFn: () => updateConfigBlock(WORKSPACE_CFG_ID, { [entryKey]: path.trim() }),
    onSuccess: res => { qc.setQueryData(['config-block', WORKSPACE_CFG_ID], res); setDirty(false); onSaved() },
  })
  // 拉取：走后端「自动确保」——clone 到用户目录 ~/.kai-toolbox 并绑定（与进入工作台时的自动逻辑同一入口）
  const pullMut = useMutation({
    mutationFn: ensureKnowledgeBase,
    onSuccess: res => { if (res.status !== 'error' && res.status !== 'disabled') afterBind() },
  })
  const pullFailed = pullMut.data && (pullMut.data.status === 'error' || pullMut.data.status === 'disabled')

  return (
    <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2.5">
      {/* 从 Git 拉取（走后端自动确保：clone 到用户目录并绑定） */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-[var(--color-foreground)]">从 Git 拉取知识库到用户目录（推荐）</div>
          <Button type="button" size="sm" className="shrink-0" disabled={pullMut.isPending} onClick={() => pullMut.mutate()}>
            {pullMut.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {pullMut.isPending ? '拉取中…' : '拉取并绑定'}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
          ⚠️ 请先用<b className="text-[var(--color-foreground)]">企业账号登录 Git（Gitee）</b>（终端 <code>git</code> 登录或配好凭据）。
          点「拉取并绑定」会自动 <code>git clone</code> 到 <code>~/.kai-toolbox/</code> 下并绑定 <code>knowledge</code> 路径；已拉过则直接绑定。未登录会失败。
        </p>
        {pullFailed && <p className="text-xs text-[var(--color-destructive)]">{pullMut.data?.message}</p>}
        {pullMut.isError && <p className="text-xs text-[var(--color-destructive)]">{errorMessage(pullMut.error)}</p>}
      </div>

      <div className="border-t border-[var(--color-border)]" />

      {/* 手动填已有本地路径 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-[var(--color-foreground)]">或：手动填已有的 knowledge 目录（绝对路径）</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="flex-1 font-mono text-xs"
            value={path}
            disabled={blockQ.isLoading}
            onChange={e => { setPath(e.target.value); setDirty(true) }}
            placeholder={blockQ.isLoading ? '读取当前配置…' : 'D:\\Users\\你\\myWork\\project-domain-knowledge\\knowledge'}
          />
          <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={!path.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {saveLabel}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
          指向本地 clone 里的 <code>knowledge</code> 子目录。保存即时生效（写运行时配置中心，不重启），随后自动重扫。留空 = 关闭知识库、按目录自动识别。
        </p>
      </div>
      {saveMut.isError && <p className="text-xs text-[var(--color-destructive)]">{errorMessage(saveMut.error)}</p>}
      {(saveMut.isSuccess || (pullMut.isSuccess && !pullFailed)) && !dirty && <p className="text-xs text-[var(--color-primary)]">已绑定并生效。</p>}
    </div>
  )
}

function SyncPanelShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="mb-4 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
          <GitCompare className="h-4 w-4" />更新项目模块（diff → 确认 → 只新增）
        </div>
        <button type="button" onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2.5 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        扫描项目代码目录、与知识库 <code>modules.json</code> 比对：勾选的新目录会<b className="text-[var(--color-foreground)]">追加为骨架条目</b>（只新增，
        不删除、不改动已有条目的中文名/路径）。改动直接写入 <code>modules.json</code>，
        <b className="text-[var(--color-foreground)]">不执行任何脚本、不改动项目代码</b>；等价于 CLI 的 <code>bootstrap.mjs sync-modules</code>，但由后端直接读写。
      </p>
      {children}
    </div>
  )
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
