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
import { applyModuleSync, createTaskspace, ensureKnowledgeBase, fetchProjectModules, fetchWorkspaceGitFileDiff, fetchWorkspaceGitStatus, listSessions, listWorkspaces, previewModuleSync, saveProjectAlias } from '@/features/claude-chat/api'
import { engineStatus } from '@/features/knowledge-graph/api'
import { GraphifyGraphModal } from '../components/GraphifyGraphModal'
import { CHAT_ROUTE, useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import type { ClaudeChatSessionView, ModuleSyncPreview, ProjectModule, ProjectModules, WorkspaceDir } from '@/features/claude-chat/types'
import { GRAPHIFY_LABEL, GRAPHIFY_TONE, REGISTRATION_LABEL, REGISTRATION_TONE } from '@/features/knowledge-graph/components/DomainKnowledgeCard'
import type { ProjectStatusSnapshot } from '@/features/knowledge-graph/types'
import { useAggregationCart, type AggregationItem } from '../hooks/useAggregationCart'
import { useStatusCache, type BusinessFilter, type GraphifyFilter } from '../hooks/useStatusCache'
import { useIgnoredProjects, type IgnoreFilter } from '../hooks/useIgnoredProjects'
import { KnowledgeGraphCard } from '../components/KnowledgeGraphCard'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'

interface PendingOpen {
  module: ProjectModule
  sessionId: string | null
}

/** 知识库根目录配置块 id = WorkspaceProperties 的 @ConfigurationProperties prefix。 */
const WORKSPACE_CFG_ID = 'toolbox.claude-chat.workspace'

/** 记住上次选中的项目路径（跨刷新/进出页面不重置）。 */
const SELECTED_PATH_LS = 'kai-toolbox:project-workspace:selected-path'

/** 把检测时间 ISO 格式化为「MM-DD HH:mm」；无效/空返回空串。 */
function fmtCheckedAt(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}


const TEAM_KNOWLEDGE_DIR = '~/.kai-toolbox/team-tools/project-domain-knowledge/knowledge'

/** 依赖项配置状态小标记：ok=绿✓，否则琥珀⚠；label 可自定义（如「未构建」「目录不存在」「就绪」）。 */
function DepMark({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      className={cn(
        'ml-1 inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] font-medium',
        ok
          ? 'bg-[var(--color-success-soft)] text-[var(--color-success-soft-foreground)]'
          : 'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-foreground)]',
      )}
    >
      {ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label ?? (ok ? '已配置' : '未配置')}
    </span>
  )
}

/** 进入工作台自动检查团队初始化目录，只尝试一次。 */
let knowledgeEnsureTried = false

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
  const knowledgeRepo = kbRepo || '<project-domain-knowledge 仓根>'
  const modulesFile = `knowledge/${project}/impl/modules.json`
  const isYoooni = project.toLowerCase() === 'yoooni'
  const projectSpecificRules = isYoooni
    ? `
Yoooni 专属数据库菜单规则：

1. 已知权威菜单表为 CRM_RIGHT，但仍须先通过只读查询核实表结构、样本和项目真实菜单 SQL。
2. 关键字段：ID=菜单节点 ID、CODE=真实菜单名称、MODELNAME=父菜单 ID、LEVELS=层级、STATUS=启停状态、NOTES=平台类型、TYPEID=菜单/权限类型、URL=页面地址。
3. 桌面 ERP 菜单核心条件必须以项目真实 SQL 为准，并重点核实：
   NOTES = 'menu' AND STATUS = 0 AND TYPEID = 0
4. 手机、平板、SCM、SCM APP 等平台须分别结合项目真实查询逻辑判断，禁止把 CRM_RIGHT 全表无条件登记。
5. 启用的 LEVELS=1 根菜单作为一级业务模块；其余真实菜单按 MODELNAME 递归放入 children。
6. URL='a' 或空 URL 的叶子通常是按钮/权限，不登记；若存在真实菜单后代，仅作为分组节点保留。
7. 页面标题与 CODE 不同时，name 保存 CODE，aliases 保存页面真实标题或 owner 确认的叫法。
8. 重点核对“产品研发”下完整页面清单，以及“开发详情看板(新)”能否定位到 menuId=704027。`
    : `
其他项目兼容规则：

1. 不得套用 Yoooni 的 CRM_RIGHT 字段、LEVELS=1、NOTES/TYPEID/STATUS 条件。
2. 动态菜单项目必须先查表结构、样本数据和项目真实菜单 SQL，确认名称、ID、父子、层级、平台、启停、节点类型和 URL 字段。
3. 静态菜单项目以路由表、FeatureManifest、菜单配置或初始化文件为权威来源。
4. 动静态并存时，数据库决定运行时菜单名称、层级和启停；代码补充路径、路由与页面标题别名。
5. 依据该项目真实根节点条件生成一级模块，并按真实父子字段递归生成 children。`

  return `我要更新知识库中「${project}」项目的模块与页面菜单索引。

知识库仓：
${knowledgeRepo}

目标项目：
${projectPath}

目标文件：
${modulesFile}

目标不是只登记一级模块，也不是把每个菜单页面平铺成一级模块，而是生成：

一级业务模块 modules
  └─ 递归页面菜单 children
       └─ 必要时继续递归 children

务必保留 owner 确认关卡：先调查、识别、生成完整候选和预览；owner 明确回复“--apply”之前禁止写盘。

一、确认菜单来源

1. 先判断项目属于数据库动态菜单、代码/文件静态菜单，还是两者并存。
2. 数据库动态菜单是名称、父子层级、启停状态和平台归属的权威来源；代码只补充路径、路由和页面标题别名。
3. 只允许 SELECT/WITH，禁止 DDL/DML；不得输出密码、Token、连接串或其他凭据。
4. 查询前必须核实表结构、样本和项目真实菜单查询逻辑，禁止仅凭字段名或经验猜测。
${projectSpecificRules}

二、模块和页面判定

1. 权威菜单源中的有效根业务菜单登记为一级 modules。
2. 根菜单下的真实菜单节点按父子关系递归放入 children；children 不计入一级模块数量。
3. 不得把每个菜单页面平铺成一级模块。
4. 排除新增、修改、删除、保存、提交、审核、作废、打印、字段权限和操作权限。
5. 空 URL 或占位 URL 的叶子节点不得仅凭节点标记登记；若有真实菜单后代，只保留为分组节点。
6. 同一 URL 对应多个菜单入口时保留全部菜单链，不按 URL 去重。
7. 数据库菜单名与页面标题不同时，name 保存权威菜单名，aliases 保存页面标题或 owner 确认叫法。
8. codePath/webPath/webPaths 只能根据 URL、Action、路由配置、JSP 或前端目录核实后填写。
9. 路径必须相对项目根，并用 Test-Path 或等价方式验证；无法确认时留空，禁止硬编。
10. 不得只扫源码目录判断业务模块，不得把 common、dao、model、util 等纯技术目录登记为模块。

识别公式：
业务模块树 = 有效根业务菜单 + 递归真实菜单容器 + 递归真实页面入口 + 经代码验证的独立业务实现 - 按钮/操作权限 - 停用节点 - 纯技术目录

三、JSON 结构

一级模块：
{
  "key": "英文稳定标识",
  "name": "权威一级菜单名",
  "codePath": "后端主目录；不确定可省略",
  "webPath": "前端主目录；不确定可省略",
  "webPaths": ["存在多个前端目录时使用"],
  "children": []
}

页面菜单节点：
{
  "key": "menu-{权威菜单ID}",
  "menuId": 704027,
  "name": "权威菜单名",
  "aliases": ["页面实际标题"],
  "url": "完整菜单 URL，保留必要参数",
  "codePath": "后端目录；不确定可省略",
  "webPath": "前端目录；不确定可省略",
  "children": []
}

要求：
- 菜单节点 key 优先使用 menu-{菜单ID}，保证同 URL 多入口不冲突。
- 分组节点允许没有 URL，但必须有真实菜单 children。
- 不创建空字符串占位字段；不确定字段可省略并进入缺字段报告。

四、历史数据校验

开始生成候选前读取 ${modulesFile}，把权威根菜单与现有一级 modules 按名称和证据对比，单列：

- 数据库/权威源新增一级模块；
- 现有但权威源不存在的一级模块；
- key 与知识点 module 不一致；
- 需要迁移的知识点；
- name、路径或菜单树待修正的已有条目；
- 可能导致一级模块数量变化的冲突。

add-modules 只新增节点、补空字段、按 key 去重，不覆盖既有有效值。已有错误值不得伪装成“去重跳过”，必须列出旧值、新值、证据和迁移建议，等待 owner 决策。不得擅自保留历史非权威模块导致一级模块数量异常。

五、预览确认

先把完整候选树写入 UTF-8 临时候选 JSON，仅执行预览：

cd ${knowledgeRepo}
node scripts/bootstrap.mjs add-modules --project ${project} --from <候选JSON文件>

禁止添加 --apply。

预览必须汇总：

- 权威源一级模块数量；
- 最终一级模块数量；
- 下级菜单节点数量；
- 实际页面数量；
- 新增一级模块和新增菜单节点；
- 补齐字段和去重跳过；
- 缺 key/name；
- 有 URL 但缺 codePath/webPath 的数量；
- 排除的按钮/权限数量；
- 历史模块冲突和建议迁移方案；
- 代表性一级菜单的完整递归页面清单。
${isYoooni ? '- “产品研发”下识别出的完整页面清单。' : ''}

预览后立即停止。只有 owner 明确回复“--apply”，才能继续；“继续”“可以”“更新一下”“补全”均不能替代。

六、落盘与校验

owner 明确回复“--apply”后：

1. 先按 owner 已确认方案处理历史模块迁移；未经确认不得覆盖或删除。
2. 对完全相同的候选文件执行：
   node scripts/bootstrap.mjs add-modules --project ${project} --from <同一候选JSON文件> --apply
3. 重新读取 modules.json，核对一级模块数、递归节点数和关键页面。
4. 执行 node scripts/bootstrap.mjs check，要求问题数为 0。
5. 执行：
   node scripts/bootstrap.mjs check-paths --project ${project} --backend-root ${projectPath} --frontend-root ${projectPath}
6. 执行 npm run build、npm run catalog、npm run smoke。

七、MCP 菜单定位能力验收

1. 先检查源码和构建产物是否已有独立 locate_menu，禁止重复实现。
2. locate_menu 应支持菜单名称、aliases、完整菜单链、URL、project/module 限定和 limit。
3. 返回至少包含 project、module key、一级模块中文名、menuId、数据库菜单名、aliases、menuPath、URL、codePath、webPath/webPaths 和匹配分数。
4. search_knowledge 继续只负责业务知识检索，不得改变原语义。
5. 若现有 locate_menu 已满足要求，只做验证；若缺能力，先报告差异，取得 owner 对代码变更的确认后再修改 MCP 源码。
6. reload_knowledge 只刷新知识数据缓存；新增或修改 MCP 工具定义后必须重新构建并重启 MCP 子进程/sidecar。
7. Forge 咨询模式只开放只读 locate_menu，不开放 reload_knowledge；同步核对 Codex 和 Claude 的知识工具白名单。
8. 最终用全新 stdio MCP 连接验证工具列表和查询结果。reload 应返回知识点数和菜单数。
${isYoooni ? '9. 验证“开发详情看板(新)”能够定位到 menuId=704027。' : ''}

红线：

- 权威菜单源决定模块名称、层级、平台和启停，代码只补路径与别名。
- 一级 modules 与递归 children 必须分层统计。
- 不把按钮权限当页面，不把页面平铺成一级模块。
- 不按 URL 去重丢失不同菜单入口。
- 不让 bootstrap 脚本自行从源码抽取业务内容。
- 不绕过 owner 确认直接 --apply。
- 不把 Yoooni 的数据库字段和过滤条件套到其他项目。`
}

/** 项目工作台：从配置工作区选项目，按确定性模块扫描结果进入对应 Vibe Coding 会话。 */
export function ProjectWorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { chat, activate } = useChatRuntime()
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
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null)
  const [gitChangesProject, setGitChangesProject] = useState<WorkspaceDir | null>(null)
  const [launchError, setLaunchError] = useState('')

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

  useEffect(() => {
    if (!chat || !pendingOpen) return
    if (pendingOpen.sessionId) chat.switchTo(pendingOpen.sessionId)
    else chat.open(pendingOpen.module.absPath)
    setPendingOpen(null)
    navigate(CHAT_ROUTE)
  }, [chat, navigate, pendingOpen])

  const openModule = async (module: ProjectModule) => {
    const session = sessionByCwd.get(normalizePath(module.absPath))
    const next = { module, sessionId: session?.id ?? null }
    setLaunchError('')
    if (!next.sessionId) {
      const seed = buildModuleScopePrompt(module)
      if (seed) {
        activate()
        try {
          await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
            type: 'CHAT_OPEN_DRAFT',
            cwd: module.absPath,
            seed,
          })
        } catch (error) {
          setLaunchError(errorMessage(error))
        }
        return
      }
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
    if (cart.items.length < 1) return
    const roots = [...new Set(cart.items.map(i => i.projectPath))]
    setAggErr('')
    setAggregating(true)
    try {
      const base = roots[0].replace(/[\\/][^\\/]+$/, '') // 取第一个项目的父目录作为放置目录
      const name = `aggregate-${Date.now().toString(36)}`
      const view = await createTaskspace(base, name, roots)
      activate()
      await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
        type: 'CHAT_OPEN_DRAFT',
        cwd: view.dir,
        seed: buildLinkagePrompt(cart.items, view.dir),
      })
      cart.clear()
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

  // ── 更新项目模块：重新解析目录 → 出 diff → 勾选确认 → 只新增落 modules.json ──
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncSel, setSyncSel] = useState<Set<string>>(new Set())
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
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
  const ensureKbMut = useMutation({
    mutationFn: ensureKnowledgeBase,
    onSuccess: res => {
      if (res.status === 'ok' || res.status === 'bound' || res.status === 'cloned') {
        void modulesQ.refetch()
      }
    },
  })
  useEffect(() => {
    if (knowledgeEnsureTried) return
    const dirExists = modulesQ.data?.knowledgeDirExists
    if (dirExists === false) { knowledgeEnsureTried = true; ensureKbMut.mutate() }
    else if (dirExists === true) { knowledgeEnsureTried = true } // 确认就绪
    // dirExists === undefined（模块尚未扫描）：先不决定，等下次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesQ.data?.knowledgeDirExists])
  const ensureFailed = !ensureKbMut.isPending
    && (ensureKbMut.isError || ensureKbMut.data?.status === 'error' || ensureKbMut.data?.status === 'disabled')
  const ensureMsg = ensureKbMut.data?.message || errorMessage(ensureKbMut.error)
  // 「知识库」按钮直接展示固定初始化目录的检查状态。
  const kbBtn = ((): { cls: string; icon: React.ReactNode; label: string } => {
    if (ensureKbMut.isPending) return { cls: 'border-transparent bg-[var(--color-info-soft)] text-[var(--color-info-soft-foreground)]', icon: <Loader2 className="animate-spin" />, label: '知识库 · 检查中' }
    if (kbReady) return { cls: 'border-transparent bg-[var(--color-success-soft)] text-[var(--color-success-soft-foreground)]', icon: <Check />, label: '知识库 · 已就绪' }
    return { cls: 'border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-foreground)]', icon: <AlertTriangle />, label: '知识库 · 未初始化' }
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
  // 「数据库分析菜单」：拉起 Claude 会话（cwd=目标项目）跑菜单识别闭环，产出清单经 add-modules 落知识库
  const launchMenuAgent = async () => {
    if (!selectedProject) return
    const kbRepo = (modulesQ.data?.knowledgeBaseDir ?? '').replace(/[\\/]knowledge[\\/]?$/, '')
    const seed = buildMenuSyncPrompt(selectedProject.name, selectedProject.path, kbRepo)
    setLaunchError('')
    activate()
    try {
      await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
        type: 'CHAT_OPEN_AND_SEND',
        cwd: selectedProject.path,
        seed,
        engine: 'claude',
      })
    } catch (error) {
      setLaunchError(errorMessage(error))
    }
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

      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
          <Info className="h-3.5 w-3.5 shrink-0" />依赖声明
        </div>
        <ul className="ml-4 list-disc space-y-0.5">
          <li><b className="text-[var(--color-foreground)]">项目列表</b> ← <code>workspace.roots</code>（工作区扫描根目录）<DepMark ok={rootsOk} /></li>
          <li><b className="text-[var(--color-foreground)]">模块清单 / 中文名</b> ← 团队初始化目录 <code>{TEAM_KNOWLEDGE_DIR}</code><DepMark ok={kbOk} label={kbOk ? '已就绪' : '未初始化'} /></li>
          <li><b className="text-[var(--color-foreground)]">业务真理识别</b> ← 团队初始化目录下的 <b className="text-[var(--color-foreground)]">project-domain-knowledge</b>（需已 build 引擎 dist）<DepMark ok={domainOk} label={domainLabel} /></li>
          <li><b className="text-[var(--color-foreground)]">跨项目拓扑识别</b> ← 团队初始化目录下的 <b className="text-[var(--color-foreground)]">cross-project-topology</b>（复用上面引擎）<DepMark ok={crossOk} label={crossLabel} /></li>
        </ul>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" className="font-medium text-[var(--color-primary)] hover:underline" onClick={() => navigate(`/tools/config-center?block=${WORKSPACE_CFG_ID}`)}>
            配置工作区目录 →
          </button>
        </div>
      </div>

      {launchError && <StateLine tone="danger" text={`启动交接失败：${launchError}`} />}

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
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <Input
                className="pl-9"
                value={projectKeyword}
                onChange={event => setProjectKeyword(event.target.value)}
                placeholder="搜索项目名称 / 路径"
              />
            </div>
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
                <span>没有项目匹配当前搜索或筛选条件</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setProjectKeyword(''); kg.setGraphifyFilter('ALL'); kg.setBusinessFilter('ALL'); ignored.setFilter('ALL') }}>
                  清除筛选
                </Button>
              </div>
            ) : (
              <>
              {activeProjects.map(project => (
                <ProjectButton
                  key={project.path}
                  project={project}
                  selected={project.path === selectedPath}
                  snapshot={kg.snapshotOf(project.path)}
                  ignored={ignored.isIgnored(project.path)}
                  editing={aliasEditingPath === project.path}
                  aliasDraft={aliasDraft}
                  aliasSaving={aliasMutation.isPending && aliasEditingPath === project.path}
                  aliasError={aliasMutation.isError && aliasEditingPath === project.path ? errorMessage(aliasMutation.error) : ''}
                   onToggleIgnore={() => ignored.toggle(project.path)}
                   onShowChanges={() => setGitChangesProject(project)}
                  onEditAlias={() => {
                    setAliasEditingPath(project.path)
                    setAliasDraft(project.alias ?? '')
                  }}
                  onAliasDraftChange={setAliasDraft}
                  onCancelAlias={() => setAliasEditingPath('')}
                  onSaveAlias={() => aliasMutation.mutate({ projectPath: project.path, alias: aliasDraft })}
                  onClick={() => {
                    setSelectedPath(project.path)
                    setKeyword('')
                    setSyncOpen(false)
                    setSyncMsg(null)
                  }}
                />
              ))}
              {ignoredProjects.length > 0 && (
                <div className="rounded-md border border-dashed border-[var(--color-border)]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                    onClick={() => setIgnoredProjectsOpen(open => !open)}
                    aria-expanded={ignoredProjectsOpen}
                  >
                    <span className="flex items-center gap-1.5">
                      {ignoredProjectsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <EyeOff className="h-3.5 w-3.5" />
                      已隐藏项目
                    </span>
                    <Badge variant="secondary">{ignoredProjects.length}</Badge>
                  </button>
                  {ignoredProjectsOpen && (
                    <div className="space-y-2 border-t border-[var(--color-border)] p-2">
                      {ignoredProjects.map(project => (
                        <ProjectButton
                          key={project.path}
                          project={project}
                          selected={project.path === selectedPath}
                          snapshot={kg.snapshotOf(project.path)}
                          ignored
                          editing={aliasEditingPath === project.path}
                          aliasDraft={aliasDraft}
                          aliasSaving={aliasMutation.isPending && aliasEditingPath === project.path}
                          aliasError={aliasMutation.isError && aliasEditingPath === project.path ? errorMessage(aliasMutation.error) : ''}
                           onToggleIgnore={() => ignored.toggle(project.path)}
                           onShowChanges={() => setGitChangesProject(project)}
                          onEditAlias={() => {
                            setAliasEditingPath(project.path)
                            setAliasDraft(project.alias ?? '')
                          }}
                          onAliasDraftChange={setAliasDraft}
                          onCancelAlias={() => setAliasEditingPath('')}
                          onSaveAlias={() => aliasMutation.mutate({ projectPath: project.path, alias: aliasDraft })}
                          onClick={() => {
                            setSelectedPath(project.path)
                            setKeyword('')
                            setSyncOpen(false)
                            setSyncMsg(null)
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              </>
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

      <GraphifyGraphModal
        open={graphOpen}
        projectPath={selectedPath}
        projectName={selectedProject?.name ?? ''}
        onClose={() => setGraphOpen(false)}
      />
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

function ProjectButton({
  project,
  selected,
  snapshot,
  ignored,
  editing,
  aliasDraft,
  aliasSaving,
  aliasError,
  onToggleIgnore,
  onShowChanges,
  onEditAlias,
  onAliasDraftChange,
  onCancelAlias,
  onSaveAlias,
  onClick,
}: {
  project: WorkspaceDir & { root: string }
  selected: boolean
  snapshot?: ProjectStatusSnapshot
  ignored: boolean
  editing: boolean
  aliasDraft: string
  aliasSaving: boolean
  aliasError: string
  onToggleIgnore: () => void
  onShowChanges: () => void
  onEditAlias: () => void
  onAliasDraftChange: (value: string) => void
  onCancelAlias: () => void
  onSaveAlias: () => void
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        'relative w-full min-w-0 rounded-md border transition-colors',
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
          : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]',
      )}
    >
      <button type="button" onClick={onClick} className="flex w-full min-w-0 flex-col gap-1 px-3 py-2 pr-24 text-left">
        <span className="truncate text-sm font-medium text-[var(--color-foreground)]">{getSystemWorkspaceDisplayName(project)}</span>
        {project.alias && <span className="truncate text-[10px] text-[var(--color-muted-foreground)]">{project.name}</span>}
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
            {snapshot?.checkedAt && (
              <span
                className="text-[10px] text-[var(--color-muted-foreground)]"
                title={`上次检测：${new Date(snapshot.checkedAt).toLocaleString()}`}
              >
                检测于 {fmtCheckedAt(snapshot.checkedAt)}
              </span>
            )}
          </>
        )}
        </div>
      </button>
      <div className="absolute right-2 top-2 flex gap-0.5">
        <button
          type="button"
          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title="查看 Git 当前更改"
          aria-label={`查看 ${getSystemWorkspaceDisplayName(project)} 的 Git 当前更改`}
          onClick={onShowChanges}
        >
          <FileDiff className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title="编辑项目别名"
          onClick={onEditAlias}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title={ignored ? '取消忽略：恢复参与「检测全部」' : '忽略：不参与「检测全部」批量知识图谱检测'}
          onClick={onToggleIgnore}
        >
          {ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      </div>
      {editing && (
        <div className="border-t border-[var(--color-border)] p-2">
          <form className="flex gap-1" onSubmit={event => { event.preventDefault(); onSaveAlias() }}>
            <Input
              autoFocus
              className="h-8 text-xs"
              maxLength={100}
              value={aliasDraft}
              onChange={event => onAliasDraftChange(event.target.value)}
              placeholder="项目别名（留空则清除）"
            />
            <Button type="submit" size="icon" className="h-8 w-8" disabled={aliasSaving} title="保存别名">
              {aliasSaving ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelAlias} title="取消">
              <X />
            </Button>
          </form>
          {aliasError && <p className="mt-1 text-[10px] text-[var(--color-destructive)]">{aliasError}</p>}
        </div>
      )}
    </div>
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

const MODULE_TREE_INDENT_PX = 12
const MAX_MODULE_TREE_INDENT_DEPTH = 4

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
              depth={1}
              sessionByCwd={sessionByCwd}
              pendingPath={pendingPath}
              onOpen={onOpen}
              isPinned={isPinned}
              onPin={onPin}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 子模块递归树行：展示任意深度的 children，并允许每个节点独立开会话/钉选。 */
function ModuleChildRow({
  module,
  depth,
  sessionByCwd,
  pendingPath,
  onOpen,
  isPinned,
  onPin,
}: {
  module: ProjectModule
  depth: number
  sessionByCwd: Map<string, ClaudeChatSessionView>
  pendingPath: string | null
  onOpen: (module: ProjectModule) => void
  isPinned: (modulePath: string) => boolean
  onPin: (module: ProjectModule) => void
}) {
  const session = sessionByCwd.get(normalizePath(module.absPath))
  const opening = pendingPath === module.absPath
  const pinned = isPinned(module.absPath)
  const children = module.children ?? []
  const indentPx = Math.min(Math.max(depth - 1, 0), MAX_MODULE_TREE_INDENT_DEPTH) * MODULE_TREE_INDENT_PX

  return (
    <div className="space-y-1.5">
      <div
        className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-[var(--color-muted)]/40 px-2.5 py-1.5"
        style={{ marginLeft: indentPx }}
      >
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
            onClick={() => onPin(module)}
            title={pinned ? '已加入待聚合，点击移除' : '钉入待聚合'}
          >
            <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpen(module)} disabled={opening}>
            {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : session ? <BotMessageSquare className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {session ? '打开' : '新建'}
          </Button>
        </div>
      </div>
      {children.map((child, ci) => (
        <ModuleChildRow
          key={`${child.relPath}|${child.name}|${ci}`}
          module={child}
          depth={depth + 1}
          sessionByCwd={sessionByCwd}
          pendingPath={pendingPath}
          onOpen={onOpen}
          isPinned={isPinned}
          onPin={onPin}
        />
      ))}
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
  onAnalyzeDatabase,
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
  onAnalyzeDatabase: () => void
}) {
  if (pending) {
    return <SyncPanelShell onClose={onClose}><StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="正在解析项目目录…" /></SyncPanelShell>
  }
  if (error) return <SyncPanelShell onClose={onClose}><StateLine tone="danger" text={error} /></SyncPanelShell>
  if (!data) return null
  if (!data.exists) return <SyncPanelShell onClose={onClose}><StateLine tone="danger" text="项目不存在或不在允许的工作区根内" /></SyncPanelShell>
  if (!data.knowledgeConfigured) {
    // 固定知识库目录不存在时，引导用户先完成团队依赖初始化。
    if (!data.knowledgeDirExists) {
      return (
        <SyncPanelShell onClose={onClose}>
          <div className="space-y-2.5 text-sm text-[var(--color-muted-foreground)]">
            <p>
              此功能依赖团队初始化后的 <b className="text-[var(--color-foreground)]">project-domain-knowledge</b>。
              当前约定目录 <code className="break-all">{data.knowledgeBaseDir || TEAM_KNOWLEDGE_DIR}</code> <b className="text-[var(--color-destructive)]">不存在</b>。
            </p>
            <KnowledgeDirSetup onSaved={onReload} />
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>也可先查询数据库菜单生成带真实菜单名的模块清单。</p>
              <Button type="button" variant="outline" size="sm" onClick={onAnalyzeDatabase}>
                <Sparkles />数据库分析菜单
              </Button>
            </div>
          </div>
        </SyncPanelShell>
    )
  }
  const selectable = data.added.filter(a => !a.keyConflict).map(a => a.codePath)
  const picks = data.added.filter(a => selected.has(a.codePath)).map(a => ({ key: a.key, codePath: a.codePath }))
  return (
    <SyncPanelShell onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            数据库菜单分析以动态菜单表中的真实菜单名为准，再结合前后端代码补充模块路径。
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onAnalyzeDatabase}>
            <Sparkles />数据库分析菜单
          </Button>
        </div>
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
 * 工作台级提示：进项目就主动告知团队知识库初始化状态。
 * - 固定目录不存在 → 醒目横幅 + 初始化指引、重新检查；
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

  // 固定目录不存在时提示先执行团队依赖初始化。
  if (data.knowledgeDirExists === false) {
    return (
      <div className="mb-3 space-y-2 rounded-md border border-[var(--color-warning,#b45309)]/40 bg-[var(--color-warning,#b45309)]/5 p-3">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning,#b45309)]" />
          <div className="min-w-0">
            <div className="font-medium text-[var(--color-foreground)]">团队知识库未初始化，当前按目录自动识别</div>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              约定目录 <code className="break-all">{data.knowledgeBaseDir || TEAM_KNOWLEDGE_DIR}</code> 不存在，请先到 Vibe Coding 完成团队依赖初始化。
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setExpanded(v => !v)}>
            {expanded ? '收起' : '查看目录'}
          </Button>
        </div>
        {expanded && <KnowledgeDirSetup onSaved={onSaved} />}
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
 * 展示团队初始化后的固定知识库目录，并允许重新检查状态。
 */
function KnowledgeDirSetup({ onSaved }: { onSaved: () => void }) {
  // 重新检查团队初始化生成的约定目录。
  const pullMut = useMutation({
    mutationFn: ensureKnowledgeBase,
    onSuccess: res => { if (res.status !== 'error' && res.status !== 'disabled') onSaved() },
  })
  const pullFailed = pullMut.data && (pullMut.data.status === 'error' || pullMut.data.status === 'disabled')

  return (
    <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2.5">
      {/* 团队依赖初始化状态 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-[var(--color-foreground)]">团队依赖初始化</div>
          <Button type="button" size="sm" className="shrink-0" disabled={pullMut.isPending} onClick={() => pullMut.mutate()}>
            {pullMut.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {pullMut.isPending ? '检查中…' : '重新检查'}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
          请先在 Vibe Coding 的团队依赖面板完成初始化。知识库固定读取
          <code>~/.kai-toolbox/team-tools/project-domain-knowledge/knowledge</code>，这里不再重复拉取或配置路径。
        </p>
        {pullFailed && <p className="text-xs text-[var(--color-destructive)]">{pullMut.data?.message}</p>}
        {pullMut.isError && <p className="text-xs text-[var(--color-destructive)]">{errorMessage(pullMut.error)}</p>}
      </div>

      {pullMut.isSuccess && !pullFailed && <p className="text-xs text-[var(--color-primary)]">初始化目录已就绪。</p>}
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
