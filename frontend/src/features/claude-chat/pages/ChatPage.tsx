import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Bug, ChevronDown, Cloud, FileText, FolderOpen, FolderTree, GitBranch, GitCommit, Hand, LayoutGrid, List, ListChecks, Maximize2, MessageSquare, Minimize2, MoreHorizontal, Package, Palette, PanelLeftClose, PanelLeftOpen, Paperclip, PictureInPicture2, Plus, RefreshCw, RotateCw, Send, Server, Settings, ShieldCheck, Slash, Sparkles, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { useChatRuntime } from '../runtime/ChatRuntimeContext'
import { MessageList } from '../components/MessageList'
import { SessionTotalBadge } from '../components/SessionTotalBadge'
import { UsagePanel } from '../components/UsagePanel'
import { PermissionDialog } from '../components/PermissionDialog'
import { QuestionDialog } from '../components/QuestionDialog'
import { SessionList } from '../components/SessionList'
import { RecentSessions } from '../components/RecentSessions'
import { HistoryList } from '../components/HistoryList'
import { NotifySettings } from '../components/NotifySettings'
import { VoiceInputButton } from '../components/VoiceInputButton'
import { AttachmentChips } from '../components/AttachmentChips'
import { QueuedList } from '../components/QueuedList'
import { SessionCapsPanel } from '../components/SessionCapsPanel'
import { setToolColors, useToolColors } from '../lib/toolColorPref'
import { ModeSwitch } from '../components/ModeSwitch'
import { ProviderSwitch } from '../components/ProviderSwitch'
import { CodexSessionOptions } from '../components/CodexSessionOptions'
import { SlashCommandMenu } from '../components/SlashCommandMenu'
import { CommandMenu } from '../components/CommandMenu'
import { PluginPanel } from '../components/PluginPanel'
import { LogsPanel } from '../components/LogsPanel'
import { GestureDebugPanel } from '../components/GestureDebugPanel'
import { ProviderDiagPanel } from '../components/ProviderDiagPanel'
import { groupModels } from '../components/modelGroups'
import { TaskspacePanel } from '../components/TaskspacePanel'
import { CloneProjectPanel } from '../components/CloneProjectPanel'
import { OnboardPipelinePanel } from '../components/OnboardPipelinePanel'
import { FileTreePanel } from '../components/FileTreePanel'
import { DebugPanel } from '../components/DebugPanel'
import { RestartDialog } from '../components/RestartDialog'
import { MultiSessionView } from '../components/MultiSessionView'
import { ProviderProfilesPanel } from '../components/ProviderProfilesPanel'
import { loadProfiles, type ProviderProfile } from '../providerProfiles'
import { engineDisplayName, engineName, providerHost, stateLabel, stateTone } from '../components/chatStatus'
import { fetchProviderModels, fetchSessionGitFileDiff, fetchSessionGitStatus, fetchSessionUsage, getSessionCommitDiff, listSessionCommits, listSessionGitRepos, listSessions, listWorkspaces, renameSession, uploadAttachment, type SessionUsage, type UploadedAttachment } from '../api'
import type { ModelInfo } from '../types'
import { CommitsPanel } from '@/components/git/CommitsPanel'
import { GitStatusPanel } from '@/components/git/GitStatusPanel'
import type { Engine } from '../types'
import { ensureNotifyPermission } from '../browserNotify'

type Panel = 'none' | 'sessions' | 'settings' | 'new' | 'plugins' | 'taskspace' | 'providers' | 'clone' | 'onboard' | 'caps' | 'filetree'

/** 单条消息最多附件数，与后端约定一致。 */
const MAX_ATTACHMENTS = 10

/** 输入框草稿按会话持久化：{ [sessionId]: 文本 }。切会话/刷新都各自保留，互不串扰。 */
const DRAFTS_KEY = 'kai-toolbox:claude-chat:drafts'
/** 无会话（新建面板等）时草稿的占位键。 */
const PENDING_DRAFT_KEY = '__pending__'
function loadDrafts(): Record<string, string> {
  try {
    const o = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}') as unknown
    return o && typeof o === 'object' ? (o as Record<string, string>) : {}
  } catch {
    return {}
  }
}
function saveDrafts(m: Record<string, string>) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(m)) } catch { /* 忽略隐私模式/配额异常 */ }
}

/** cwd 末段目录名，作为无别名会话的显示名（与会话列表 shortCwd 一致）。 */
function headerCwdName(cwd: string): string {
  if (!cwd) return ''
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}

/** 分屏视图形态持久化：刷新后恢复「上次是单/多视图 + 分屏中的会话」。 */
const SPLIT_STATE_KEY = 'kai-toolbox:claude-chat:split-state'
function loadSplitState(): { viewMode: 'single' | 'multi'; multiIds: string[] } {
  try {
    const o = JSON.parse(localStorage.getItem(SPLIT_STATE_KEY) || 'null')
    const ids: string[] = Array.isArray(o?.multiIds) ? o.multiIds.filter((x: unknown) => typeof x === 'string') : []
    // 仅当确有分屏会话时才恢复多视图，避免空分屏
    return { viewMode: o?.viewMode === 'multi' && ids.length > 0 ? 'multi' : 'single', multiIds: ids }
  } catch {
    return { viewMode: 'single', multiIds: [] }
  }
}

/** 附件 + 本地 blob 预览地址（图片粘贴后点击放大核对，无需后端回读端点）。 */
type ChatAttachment = UploadedAttachment & { previewUrl?: string }

/** 顶栏「更多」菜单的一项：图标 + 中文标签（+ 可选副提示）。nested=分组内子项，左侧缩进以示层级。 */
function HeaderMenuItem({ icon, label, hint, onClick, nested }: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
  nested?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 py-2 text-left hover:bg-[var(--color-muted)] ${nested ? 'pl-9 pr-3' : 'px-3'}`}
    >
      <span className="shrink-0 text-[var(--color-muted-foreground)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">{hint}</span>}
      </span>
    </button>
  )
}

/** 顶栏「更多」菜单的一个可折叠分组：点标题展开/收起其子项（手风琴，单开互斥），减少一次性铺陈。 */
function MenuSection({ icon, label, open, onToggle, children }: {
  icon: ReactNode
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)]"
      >
        <span className="shrink-0 text-[var(--color-muted-foreground)]">{icon}</span>
        <span className="flex-1 text-sm font-medium">{label}</span>
        <ChevronDown className={`size-4 text-[var(--color-muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

export function ChatPage() {
  const { chat, setFloating, setMinimized, setVoiceMode, getReturnRoute, gestureOn, toggleGesture, gestureStatus, gestureError: gestureErr } = useChatRuntime()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pending = chat?.pending ?? null

  // 新建/续接会话后，sessionId 变化即刷新会话列表缓存，让左侧常驻导航与「会话」面板立刻出现该会话。
  // 否则新会话只在缓存过期(staleTime)、窗口重新聚焦或手动开一次「会话」面板(重挂 SessionList 触发拉取)后才显示
  // ——表现为「新建后列表不更新，要刷新或点一次会话」。
  useEffect(() => {
    if (chat?.sessionId) qc.invalidateQueries({ queryKey: ['claude-chat-sessions'] })
  }, [chat?.sessionId, qc])

  // 一键重启后端：依次试两条通道，任一成功即可（带超时，绝不无限等待——之前 fetch 无超时，
  // 通道不可达时一直卡在“正在请求重启…”）。
  //   1) POST /api/system/restart —— 后端自重启端点。走 /api 通道(dev 经 Vite 代理、生产直连后端都可达)，
  //      进程优雅退出后由守护脚本(run-supervised.ps1)检测到 HasExited 重新拉起。token=toolbox.system.restart-token。
  //   2) POST /supervisor/restart —— 守护进程独立控制口(:18081)，仅 dev 经 Vite /supervisor 代理可达；
  //      生产无此代理、或 :18081 HttpListener 因 urlacl 未起时不可达。token=TOOLBOX_SUPERVISOR_RESTART_TOKEN。
  // 两端 token 可能不同；用同一输入框值分别试，任一匹配并触发即算成功。重启后 WS 断、前端自动重连续上。
  // token 用应用内输入框收，不用 window.prompt：移动端浏览器/WebView 普遍禁用 prompt（静默返回 null）。
  const [showCommits, setShowCommits] = useState(false)
  const [showGitStatus, setShowGitStatus] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [showGestureDebug, setShowGestureDebug] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [headerMenu, setHeaderMenu] = useState(false)
  // 「更多」菜单当前展开的分组（手风琴，单开互斥；null=全部收起）。跨开合记忆上次展开项。
  const [menuGroup, setMenuGroup] = useState<'view' | 'session' | 'workspace' | 'system' | null>(null)
  const [restartOpen, setRestartOpen] = useState(false)
  const openRestart = () => setRestartOpen(true)

  // 全自动·弹窗自动允许（前端兜底）：bypassPermissions 下仍偶有工具弹 allow/deny 框，
  // 开此开关后收到权限框就自动 decide(allow)。仅对 permission 生效，question（AskUserQuestion）不自动应答。
  const [autoApprove, setAutoApprove] = useState(() => localStorage.getItem('kai-toolbox:auto-approve-permission') === '1')
  const autoApprovedRef = useRef<string | null>(null)
  const toggleAutoApprove = () => {
    setAutoApprove(v => {
      const nv = !v
      localStorage.setItem('kai-toolbox:auto-approve-permission', nv ? '1' : '0')
      return nv
    })
  }
  useEffect(() => {
    if (!chat || chat.mode !== 'bypassPermissions' || !autoApprove) return
    if (pending?.kind !== 'permission') return
    if (autoApprovedRef.current === pending.reqId) return // 同一请求只自动放行一次
    autoApprovedRef.current = pending.reqId
    chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })
  }, [pending, autoApprove, chat])

  // 弹出悬浮窗：开启浮窗并离开会话页（浮窗与全屏页互斥渲染）。回到进入会话页前最后访问的页面，而非每次回首页。
  const popOutFloating = () => {
    setFloating(true)
    setMinimized(false)
    navigate(getReturnRoute())
  }

  // 手势弹窗：开关/状态由 ChatRuntime 统一持有（监控上提到常驻运行时，才能在悬浮态用「展开」手势返回）。
  const [panel, setPanel] = useState<Panel>('none')
  const [showUsage, setShowUsage] = useState(false)
  const toolColors = useToolColors()
  // 整会话累计用量：后端按 sessionId 统计 transcript（不受前端分页影响）。换会话或一轮跑完后刷新。
  const [sessionUsage, setSessionUsage] = useState<SessionUsage | null>(null)
  const usageSid = chat?.sessionId ?? null
  const usageRunning = chat?.running ?? false
  useEffect(() => {
    if (!usageSid) { setSessionUsage(null); return }
    if (usageRunning) return
    let alive = true
    fetchSessionUsage(usageSid).then((u) => { if (alive) setSessionUsage(u) }).catch(() => {})
    return () => { alive = false }
  }, [usageSid, usageRunning])
  // 多会话并行分屏：viewMode 切换单/多视图；selecting 控制会话面板的多选态；selected 为勾选集合；multiIds 为已进入分屏的会话
  // 刷新后恢复上次的分屏形态（视图 + 会话集合）
  const splitInit = useMemo(loadSplitState, [])
  const [viewMode, setViewMode] = useState<'single' | 'multi'>(splitInit.viewMode)
  const [multiIds, setMultiIds] = useState<string[]>(splitInit.multiIds)
  // 形态变化即写回本地
  useEffect(() => {
    try { localStorage.setItem(SPLIT_STATE_KEY, JSON.stringify({ viewMode, multiIds })) } catch { /* 忽略隐私模式/配额 */ }
  }, [viewMode, multiIds])
  // 单会话模式的常驻左侧会话导航（md+ 显示）是否展开
  const [railOpen, setRailOpen] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const enterMulti = () => {
    if (selected.size === 0) return
    setMultiIds([...selected])
    setViewMode('multi')
    setPanel('none')
    setSelecting(false)
  }
  const [sessTab, setSessTab] = useState<'tool' | 'history'>('tool')
  // 输入框草稿按会话绑定 + 本地持久化：切到任意会话只显示该会话自己的草稿，互不串扰、刷新保留。
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts())
  // 聚合联动提示预填:从项目工作台「一键聚合」跳来时读一次 sessionStorage 草稿；先存到 ref，待当前会话就绪再落到其草稿。
  const seedRef = useRef<string | null>(null)
  const seedReadRef = useRef(false)
  if (!seedReadRef.current) {
    seedReadRef.current = true
    try {
      const seed = sessionStorage.getItem('kai-toolbox:claude-chat:aggregation-draft')
      if (seed) { sessionStorage.removeItem('kai-toolbox:claude-chat:aggregation-draft'); seedRef.current = seed }
    } catch { /* 忽略隐私模式异常 */ }
  }
  const draftKey = chat?.sessionId ?? PENDING_DRAFT_KEY
  const draft = drafts[draftKey] ?? ''
  const setDraft = useCallback((v: string | ((d: string) => string)) => {
    setDrafts(prev => {
      const cur = prev[draftKey] ?? ''
      const next = typeof v === 'function' ? (v as (d: string) => string)(cur) : v
      const m = { ...prev }
      if (next) m[draftKey] = next; else delete m[draftKey]
      saveDrafts(m)
      return m
    })
  }, [draftKey])
  // 聚合 seed：当前会话就绪且其草稿为空时，把一次性 seed 落到该会话草稿。
  useEffect(() => {
    if (seedRef.current && chat?.sessionId && !(drafts[chat.sessionId])) {
      const s = seedRef.current
      seedRef.current = null
      setDraft(s)
    }
  }, [chat?.sessionId, drafts, setDraft])

  // 模块编码范围 seed：项目工作台「新建会话」打开某模块时写入本模块的 codePath/webPath 约束，
  // 会话就绪且草稿为空时预填进输入框（不自动发送——它是范围前言，用户在后面接着写需求）。一次性。
  useEffect(() => {
    if (!chat?.sessionId) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:module-open-context') } catch { return }
    if (!raw) return
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:module-open-context') } catch { /* ignore */ }
    if (!drafts[chat.sessionId]) setDraft(raw)
  }, [chat?.sessionId, drafts, setDraft])

  // ERP 需求开发前门 handoff：「ERP 需求开发」模块把 {cwd, seed} 写 sessionStorage 后跳来，
  // 这里一次性消费——在 ERP 工作区开一个 Claude 会话并投喂触发语拉起 yoooni-erp-auto-dev skill。
  const erpLaunchedRef = useRef(false)
  useEffect(() => {
    if (erpLaunchedRef.current || !chat) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:erp-dev-launch') } catch { /* ignore */ }
    if (!raw) return
    erpLaunchedRef.current = true
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:erp-dev-launch') } catch { /* ignore */ }
    try {
      const { cwd, seed } = JSON.parse(raw) as { cwd?: string; seed?: string }
      if (seed) {
        chat.open((cwd ?? '').trim(), undefined, undefined, 'claude')
        chat.send(seed)
      }
    } catch { /* 解析失败忽略 */ }
  }, [chat])

  // 知识图谱管理 handoff：「知识图谱管理」模块把 {cwd, seed} 写 sessionStorage 后跳来，
  // 在 project-domain-knowledge/cross-project-topology 仓库目录开一个会话并投喂触发语拉起 domain-knowledge-bootstrap skill。
  const kgBootstrapLaunchedRef = useRef(false)
  useEffect(() => {
    if (kgBootstrapLaunchedRef.current || !chat) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:knowledge-graph-bootstrap-launch') } catch { /* ignore */ }
    if (!raw) return
    kgBootstrapLaunchedRef.current = true
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:knowledge-graph-bootstrap-launch') } catch { /* ignore */ }
    try {
      const { cwd, seed } = JSON.parse(raw) as { cwd?: string; seed?: string }
      if (seed) {
        chat.open((cwd ?? '').trim(), undefined, undefined, 'claude')
        chat.send(seed)
      }
    } catch { /* 解析失败忽略 */ }
  }, [chat])

  // Graphify 生成 handoff：项目工作台知识图谱卡片把 {cwd, seed} 写 sessionStorage 后跳来，
  // 在目标项目自己的目录开一个会话并投喂 "/graphify" 或 "/graphify --update"，拉起 graphify skill
  // 跑代码结构图生成流程（AST 解析 + 语义抽取子 Agent + 社区检测打标，产物写入该项目的 graphify-out/）。
  const graphifyGenerateLaunchedRef = useRef(false)
  useEffect(() => {
    if (graphifyGenerateLaunchedRef.current || !chat) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:graphify-generate-launch') } catch { /* ignore */ }
    if (!raw) return
    graphifyGenerateLaunchedRef.current = true
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:graphify-generate-launch') } catch { /* ignore */ }
    try {
      const { cwd, seed } = JSON.parse(raw) as { cwd?: string; seed?: string }
      if (seed) {
        chat.open((cwd ?? '').trim(), undefined, undefined, 'claude')
        chat.send(seed)
      }
    } catch { /* 解析失败忽略 */ }
  }, [chat])

  // 「按菜单识别模块」handoff：项目工作台「Agent 识菜单」把 {cwd, seed} 写 sessionStorage 后跳来，
  // 开一个 Claude 会话（cwd=目标项目，便于读其前端菜单/路由）并投喂提示——agent 读菜单→产模块清单→
  // 经 domain-knowledge 的 add-modules 落 modules.json（先预览、owner 确认后再 --apply）。一次性。
  const menuSyncLaunchedRef = useRef(false)
  useEffect(() => {
    if (menuSyncLaunchedRef.current || !chat) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:module-sync-launch') } catch { /* ignore */ }
    if (!raw) return
    menuSyncLaunchedRef.current = true
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:module-sync-launch') } catch { /* ignore */ }
    try {
      const { cwd, seed } = JSON.parse(raw) as { cwd?: string; seed?: string }
      if (seed) {
        chat.open((cwd ?? '').trim(), undefined, undefined, 'claude')
        chat.send(seed)
      }
    } catch { /* 解析失败忽略 */ }
  }, [chat])

  // PRD 开发 handoff：prd-clarify「开始开发」把 {cwd, seed, prdSessionId} 写 sessionStorage 后跳来，
  // 在指定工作目录开一个会话，自动发送 PRD 内容 + feature-dev 引导消息，并回写 devSessionId 到 PRD 记录。一次性。
  const prdDevLaunchedRef = useRef(false)
  useEffect(() => {
    if (prdDevLaunchedRef.current || !chat) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:prd-dev-launch') } catch { /* ignore */ }
    if (!raw) return
    prdDevLaunchedRef.current = true
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:prd-dev-launch') } catch { /* ignore */ }
    try {
      const { cwd, seed, prdSessionId } = JSON.parse(raw) as { cwd?: string; seed?: string; prdSessionId?: string }
      if (seed) {
        chat.open((cwd ?? '').trim(), undefined, undefined, 'claude')
        chat.send(seed)
        // 回写开发会话 ID 到 PRD（非关键，失败忽略）
        // chat.sessionId 在 init/ready 事件后设置，等 1.5s 让它稳定
        if (prdSessionId) {
          setTimeout(() => {
            const sid = chat.sessionId
            if (sid) {
              fetch(`/api/prd-clarify/sessions/${prdSessionId}/link-dev-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ devSessionId: sid }),
              }).catch(() => {})
            }
          }, 1500)
        }
      }
    } catch { /* 解析失败忽略 */ }
  }, [chat])

  // PRD 澄清 handoff：prd-clarify「开始需求澄清」把 {cwd, seed, prdSessionId} 写 sessionStorage 后跳来，
  // 在项目工作区开一个会话，运行 feature-dev Phase 3 澄清流程，Claude 完成后直接写 PRD 文件。
  // PRD 文件写入后，prd-clarify 通过 check-prd-file 接口检测并更新状态。一次性。
  const prdClarifyLaunchedRef = useRef(false)
  useEffect(() => {
    if (prdClarifyLaunchedRef.current || !chat) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:prd-clarify-launch') } catch { /* ignore */ }
    if (!raw) return
    prdClarifyLaunchedRef.current = true
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:prd-clarify-launch') } catch { /* ignore */ }
    try {
      const { cwd, seed, prdSessionId } = JSON.parse(raw) as { cwd?: string; seed?: string; prdSessionId?: string }
      if (seed) {
        chat.open((cwd ?? '').trim(), undefined, undefined, 'claude')
        chat.send(seed)
        // 记录关联，供 prd-clarify 页面来 check-prd-file 时使用
        if (prdSessionId) {
          setTimeout(() => {
            const sid = chat.sessionId
            if (sid) {
              fetch(`/api/prd-clarify/sessions/${prdSessionId}/link-dev-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ devSessionId: sid }),
              }).catch(() => {})
            }
          }, 1500)
        }
      }
    } catch { /* 解析失败忽略 */ }
  }, [chat])

  // 面板 handoff：别的模块（如「ERP 需求开发」空工作区引导）跳来时指定直接打开某个面板（如 clone）。一次性。
  useEffect(() => {
    let raw: string | null = null
    try { raw = sessionStorage.getItem('kai-toolbox:claude-chat:open-panel') } catch { /* ignore */ }
    if (!raw) return
    try { sessionStorage.removeItem('kai-toolbox:claude-chat:open-panel') } catch { /* ignore */ }
    if (raw === 'clone' || raw === 'taskspace' || raw === 'new' || raw === 'filetree' || raw === 'onboard'
        || raw === 'caps' || raw === 'providers' || raw === 'plugins' || raw === 'settings' || raw === 'sessions') {
      setPanel(raw)
    }
  }, [])
  const [newCwd, setNewCwd] = useState('')
  const [wsIdx, setWsIdx] = useState(0) // 当前选中的工作区（root）下标，两级目录选择用
  const [newEngine, setNewEngine] = useState<Engine>('claude')
  // 第三方网关「服务商」：newProviderId 空=官方默认；newModel 为走网关时手填的模型名
  const [providers, setProviders] = useState<ProviderProfile[]>(() => loadProfiles())
  const [newProviderId, setNewProviderId] = useState('')
  const [newModel, setNewModel] = useState('')
  // 选中网关后从其 /v1/models 拉的可选模型目录（供下拉选择，仍可手填）
  const [providerModels, setProviderModels] = useState<ModelInfo[]>([])
  const [providerModelsLoading, setProviderModelsLoading] = useState(false)
  const [providerModelsError, setProviderModelsError] = useState<string | null>(null)
  const [newModelPlatform, setNewModelPlatform] = useState('all') // 新建会话模型的平台二级筛选
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [slashIdx, setSlashIdx] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [cmdMenuOpen, setCmdMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [engineMenuOpen, setEngineMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const engineWatermark = useRef<Record<string, number>>({}) // 每引擎"上次看到的消息位置"，切 agent 时算增量 seed

  // 新建会话：网关模型按平台分组 + 平台二级筛选（网关动辄上百个，平铺难选）
  const providerModelGroups = useMemo(() => groupModels(providerModels), [providerModels])
  const shownNewModels = newModelPlatform === 'all'
    ? providerModels
    : (providerModelGroups.find(g => g.key === newModelPlatform)?.models ?? providerModels)

  // 输入框随内容自动升高（参考微信）：到 max-h 后内部滚动
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // 全屏时按 Esc 退出
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // 选中第三方网关时，从其 /v1/models 拉可选模型目录（后端代理）。失败/空回退手填，不阻断新建。
  useEffect(() => {
    if (panel !== 'new' || (newEngine !== 'claude' && newEngine !== 'codex' && newEngine !== 'gemini') || newProviderId === '') {
      setProviderModels([])
      return
    }
    const p = providers.find(x => x.id === newProviderId)
    if (!p) { setProviderModels([]); return }
    let cancelled = false
    setProviderModelsLoading(true)
    setProviderModelsError(null)
    setNewModelPlatform('all') // 换网关重置平台筛选
    fetchProviderModels(p.baseUrl, p.key)
      .then(r => {
        if (cancelled) return
        setProviderModels(r.models ?? [])
        setProviderModelsError((r.models?.length ?? 0) === 0 ? (r.error ?? '网关未返回模型') : null)
      })
      .catch(e => { if (!cancelled) { setProviderModels([]); setProviderModelsError(`请求失败：${(e as Error)?.message ?? '未知错误'}`) } })
      .finally(() => { if (!cancelled) setProviderModelsLoading(false) })
    return () => { cancelled = true }
  }, [panel, newEngine, newProviderId, providers])

  // 自动续接最近会话已上提到 ChatRuntime 引擎（跨路由常驻），此处不再处理。

  // 新建面板展开时才扫描工作目录；接口失败/为空则下拉为空，输入框仍可手填（降级不阻断）
  const { data: workspaces } = useQuery({
    queryKey: ['claude-chat-workspaces'],
    queryFn: listWorkspaces,
    enabled: panel === 'new',
    staleTime: 5000,
  })
  // 两级工作目录：先选工作区 root，再列该 root 下的一级目录（只显示名字）。
  const wsRoots = workspaces?.roots.filter(r => r.exists) ?? []
  const activeRoot = wsRoots.length ? wsRoots[Math.min(wsIdx, wsRoots.length - 1)] : null

  // 顶栏标题显示当前会话名（与会话列表一致：别名优先，无别名回退 cwd 目录名）；无会话时才回退 Vibe Coding
  const { data: sessions = [] } = useQuery({
    queryKey: ['claude-chat-sessions'],
    queryFn: listSessions,
    staleTime: 5000,
  })
  const currentSession = sessions.find(s => s.id === chat?.sessionId)
  const currentTitle = currentSession
    ? (currentSession.title?.trim() || headerCwdName(currentSession.cwd))
    : undefined

  // 顶栏标题双击直接改名：本地态显示编辑框，提交后写回后端并让会话列表/标题一并刷新。
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const startEditTitle = () => {
    if (!currentSession) return
    setTitleDraft(currentTitle ?? '')
    setEditingTitle(true)
  }
  const commitEditTitle = async () => {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (t && currentSession && t !== currentTitle) {
      await renameSession(currentSession.id, t)
      qc.invalidateQueries({ queryKey: ['claude-chat-sessions'] })
    }
  }
  const currentProviderHost = providerHost(chat?.currentProviderBaseUrl ?? null)
  const currentEngineLabel = engineDisplayName(chat?.currentEngine ?? 'claude', chat?.currentProviderKind)
  const currentEngineTitle = chat?.currentProviderKind === 'thirdParty'
    ? `切换 agent（当前 Claude 使用第三方网关：${currentProviderHost ?? chat.currentProviderBaseUrl ?? '未知'}）`
    : '切换 agent（会话内切换，自动带上下文）'

  // 引擎激活前一帧 chat 可能为空（懒启动）：占位，下一帧即就绪
  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        正在启动 Vibe Coding…
      </div>
    )
  }

  const startNew = () => {
    // 服务商仅 Claude 引擎生效：选了档案则走第三方网关 + 手填模型，否则官方默认
    // 第三方网关对 Claude / Codex / Gemini 生效（各走各的协议端点）
    const usesGateway = newEngine === 'claude' || newEngine === 'codex' || newEngine === 'gemini'
    const profile = usesGateway ? providers.find(p => p.id === newProviderId) : undefined
    const provider = profile ? { apiBaseUrl: profile.baseUrl, authToken: profile.key } : undefined
    // 模型：claude/codex 网关用档案/手填；opencode 用手填的 provider/model（留空走默认）；其它引擎不传
    const model = newEngine === 'opencode'
      ? (newModel.trim() || undefined)
      : profile ? (newModel.trim() || profile.model || undefined) : undefined
    chat.open(newCwd.trim(), model, undefined, newEngine, provider)
    setPanel('none')
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || !chat.sessionId) return
    const room = MAX_ATTACHMENTS - attachments.length - uploading
    const take = Array.from(files).slice(0, Math.max(0, room))
    const sid = chat.sessionId
    for (const f of take) {
      setUploading(n => n + 1)
      try {
        const att = await uploadAttachment(sid, f)
        const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
        setAttachments(prev => [...prev, { ...att, previewUrl }])
      } catch (e) {
        console.error('[claude-chat] 附件上传失败', e)
      } finally {
        setUploading(n => n - 1)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  // 粘贴：剪贴板含文件（如截图）则当附件上传，纯文本照常粘贴
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void handleFiles(files)
    }
  }

  const submit = () => {
    if (!chat.sessionId) return
    if (!draft.trim() && attachments.length === 0) return
    ensureNotifyPermission() // 借发送这个手势兜底申请一次通知权限

    const atts = attachments.map(a => ({ name: a.name, path: a.path, mime: a.mime, url: a.previewUrl }))
    // 正在回答中 → 入待发送队列，本轮结束后自动按序发；否则立即发
    if (chat.running) {
      chat.enqueue(draft, atts)
    } else {
      // 图片把本地 previewUrl 一并带上 → 气泡里显示缩略图（object URL 不在此 revoke，已被消息引用）
      chat.send(draft, atts)
    }
    setDraft('')
    setAttachments([])
    // 发送后收回输入框高度：等 DOM 清空（下一帧）再按内容重算，避免停留在变高后的高度
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
  }

  // 会话内切 agent（方案B + 增量交接）：同一会话不分裂。
  // sidecar 会 resume 目标引擎的原生会话（早期上下文不丢）；前端只把"它离开期间的增量"喂过去，
  // 首次切到某引擎才发全量——避免切回时全量重复同步。
  const pickEngine = (eng: Engine) => {
    setEngineMenuOpen(false)
    if (eng === chat.currentEngine || chat.running || !chat.sessionId) return
    const from = chat.currentEngine
    engineWatermark.current[from] = chat.items.length // 记录离开引擎看到的位置
    const start = engineWatermark.current[eng] ?? 0   // 目标引擎上次看到的位置（首次为 0=全量）
    const body = chat.items
      .slice(start)
      .filter(i => (i.kind === 'user' || i.kind === 'assistant')
        && !('text' in i && i.text.startsWith('【切换 agent'))) // 过滤交接 recap，避免再次转喂
      .map(i => (i.kind === 'user' ? '我：' : '助手：') + ('text' in i ? i.text : ''))
      .join('\n')
    let seed = body
    const MAX = 6000
    if (seed.length > MAX) seed = '…（较早内容略）\n' + seed.slice(-MAX)
    chat.switchEngine(eng)
    if (seed.trim()) {
      const intro = start === 0
        ? '以下是我和上一个 agent 的完整对话，请阅读后接续协助：'
        : '你之前参与过本会话（原生上下文已恢复）。以下仅为你离开期间的新对话，据此接续、勿重复：'
      chat.send(`【切换 agent · 上下文交接】${intro}\n\n${seed}`)
    }
  }

  // slash 命令补全：输入框行首为 "/<前缀>"（无空格）时按前缀过滤可用命令
  const slashMatch = /^\/(\S*)$/.exec(draft)
  const slashFiltered = slashMatch
    ? chat.slashCommands.filter(c => c.toLowerCase().startsWith(slashMatch[1].toLowerCase()))
    : []
  const showSlash = !slashDismissed && slashMatch != null && slashFiltered.length > 0
  const slashActive = showSlash ? Math.min(slashIdx, slashFiltered.length - 1) : 0
  const pickSlash = (cmd: string) => {
    setDraft('/' + cmd + ' ') // 带空格便于接参数；含空格后正则不再匹配，浮层自动收起
    setSlashDismissed(true)
    setSlashIdx(0)
  }

  return (
    <div className={fullscreen
      // 全屏是覆盖整个视口的浮层，背景必须不透明——否则底层（折叠侧栏等）会从半透明背景透出，左侧留残影
      ? 'fixed inset-0 z-50 flex h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-[var(--color-background)]'
      : 'flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-x-hidden bg-[var(--color-muted)]/40'}>
      {/* 顶栏：中性浅灰 + 1px 边框（Notion 风），不抢视觉 */}
      <header className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 shadow-sm">
        {viewMode === 'multi' ? (
          /* 分屏下顶部不挂某一个会话的标题/引擎/状态/用量（各 pane 自带），只给中性标识 */
          <span className="font-semibold">分屏 · {multiIds.length} 个会话</span>
        ) : (
          <>
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={() => void commitEditTitle()}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); void commitEditTitle() }
                  else if (e.key === 'Escape') setEditingTitle(false)
                }}
                className="max-w-[40vw] min-w-0 rounded border border-[var(--color-primary)] bg-[var(--color-background)] px-1.5 py-0.5 font-semibold outline-none"
              />
            ) : (
              <span
                className="max-w-[40vw] truncate font-semibold"
                title={`${currentTitle || 'Vibe Coding'}${currentSession ? '\n双击重命名' : ''}`}
                onDoubleClick={startEditTitle}
              >
                {currentTitle || 'Vibe Coding'}
              </span>
            )}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setEngineMenuOpen(o => !o)}
                title={currentEngineTitle}
                className={`rounded px-1.5 py-0.5 text-[10px] ${chat.currentEngine === 'codex'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200'
                  : chat.currentProviderKind === 'thirdParty'
                    ? 'border border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted-foreground)]'}`}
              >
                {currentEngineLabel} ▾
              </button>
              {engineMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setEngineMenuOpen(false)} />
                  <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-lg border bg-[var(--color-card)] p-1 shadow-lg">
                    <div className="px-2 py-1 text-[10px] text-[var(--color-muted-foreground)]">切 agent（带上下文）</div>
                    {(['claude', 'codex', 'gemini', 'opencode'] as Engine[]).map(eng => (
                      <button
                        key={eng}
                        type="button"
                        onClick={() => pickEngine(eng)}
                        disabled={chat.running}
                        className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-40 ${eng === chat.currentEngine ? 'font-semibold text-[var(--color-primary)]' : ''}`}
                      >
                        {engineName(eng)}{eng === chat.currentEngine && ' ·当前'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <StatusBadge
              tone={stateTone(chat.state)}
              pulse={chat.state === 'connecting'}
              title={stateLabel(chat.state)}
              aria-label={stateLabel(chat.state)}
              className="size-5 shrink-0 justify-center rounded-full px-0"
            />
            <SessionTotalBadge items={chat.items} serverTotal={sessionUsage} onClick={() => setShowUsage(true)} />
          </>
        )}
        {/* 手势弹窗状态：开启后提示摄像头正在识别（隐私可见），点击可关 */}
        {gestureOn && (
          <button
            type="button"
            onClick={toggleGesture}
            title={gestureErr ? `手势弹窗出错：${gestureErr}（点击关闭）`
              : gestureStatus === 'running' ? '手势监控中：握拳=弹窗 / 张手=返回（摄像头开启中，点击关闭）'
              : gestureStatus === 'loading' ? '手势模型加载中…（点击关闭）'
              : '手势弹窗已开（点击关闭）'}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${gestureErr
              ? 'border-[var(--color-destructive)] text-[var(--color-destructive)]'
              : gestureStatus === 'running'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-[var(--color-muted-foreground)]'}`}
          >
            <Hand className={`size-3 ${gestureStatus === 'running' ? 'animate-pulse' : ''}`} />
            {gestureErr ? '手势×' : gestureStatus === 'loading' ? '手势…' : '手势'}
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* 用量入口已并入头部 SessionTotalBadge（点徽章打开） */}
          {/* 常用：带文字标签，一眼可辨 */}
          <Button variant="ghost" size="sm" className="gap-1 px-2 sm:px-3" onClick={() => setPanel(p => p === 'new' ? 'none' : 'new')} aria-label="新建会话">
            <Plus className="size-4" /> <span className="hidden sm:inline">新建</span>
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 px-2 sm:px-3" onClick={() => setPanel(p => p === 'sessions' ? 'none' : 'sessions')} aria-label="会话列表">
            <List className="size-4" /> <span className="hidden sm:inline">会话</span>
          </Button>
          {/* 其余功能收进「更多」菜单，每项带中文标签，避免一排没标识的图标 */}
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setHeaderMenu(o => !o)} aria-label="更多功能" title="更多功能">
              <MoreHorizontal className="size-5" />
            </Button>
            {headerMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 max-h-[75vh] w-56 overflow-y-auto rounded-xl border bg-[var(--color-popover)] py-1 text-[var(--color-popover-foreground)] shadow-xl">
                  {/* 分组折叠（手风琴），单开互斥：默认全部收起，点分组才展开，减少一次性铺陈 */}
                  {(() => { const toggle = (g: typeof menuGroup) => setMenuGroup(cur => cur === g ? null : g); return (<>
                  <MenuSection icon={<LayoutGrid className="size-4" />} label="视图" open={menuGroup === 'view'} onToggle={() => toggle('view')}>
                    <HeaderMenuItem nested icon={<Cloud className="size-4" />} label="语音模式" hint="全屏白云·纯语音对话" onClick={() => { setHeaderMenu(false); setVoiceMode(true) }} />
                    <HeaderMenuItem nested icon={<PictureInPicture2 className="size-4" />} label="弹出悬浮窗" hint="切到其他模块常驻显示" onClick={() => { setHeaderMenu(false); popOutFloating() }} />
                    <HeaderMenuItem nested icon={<Hand className="size-4" />} label={gestureOn ? '手势控制·开' : '手势控制·关'} hint={gestureOn ? '握拳=弹出悬浮窗；张手=返回会话页' : '开启后：握拳弹窗 / 张手返回(仅本模块)'} onClick={() => { setHeaderMenu(false); toggleGesture() }} />
                    <HeaderMenuItem nested icon={<Hand className="size-4" />} label="手势自检" hint="逐步测试摄像头/模型/识别，排查能否启用" onClick={() => { setHeaderMenu(false); setShowGestureDebug(true) }} />
                    <HeaderMenuItem nested icon={fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} label={fullscreen ? '退出全屏' : '全屏显示'} onClick={() => { setHeaderMenu(false); setFullscreen(f => !f) }} />
                    <HeaderMenuItem nested icon={<Palette className="size-4" />} label={toolColors ? '工具着色 · 开' : '工具着色 · 关'} hint="按命令/读写/子代理/技能/MCP 上色" onClick={() => { setToolColors(!toolColors) }} />
                  </MenuSection>
                  <MenuSection icon={<MessageSquare className="size-4" />} label="会话" open={menuGroup === 'session'} onToggle={() => toggle('session')}>
                    {chat.sessionId && (
                      <HeaderMenuItem nested icon={<RefreshCw className="size-4" />} label="重载会话" hint="重连原生会话，加载最新插件/技能/命令" onClick={() => { setHeaderMenu(false); chat.resumeCurrent() }} />
                    )}
                    <HeaderMenuItem nested icon={<Sparkles className="size-4" />} label="会话能力" hint="激活的技能 / 子代理 / MCP 服务" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'caps' ? 'none' : 'caps') }} />
                  </MenuSection>
                  <MenuSection icon={<FolderTree className="size-4" />} label="工作区 · 项目" open={menuGroup === 'workspace'} onToggle={() => toggle('workspace')}>
                    {chat.sessionId && (
                      <HeaderMenuItem nested icon={<FolderOpen className="size-4" />} label="工作目录" hint="展开工作目录·快速找文件/定位" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'filetree' ? 'none' : 'filetree') }} />
                    )}
                    {chat.sessionId && (
                      <>
                        <HeaderMenuItem nested icon={<GitCommit className="size-4" />} label="提交记录" hint="当前目录 git 提交/diff" onClick={() => { setHeaderMenu(false); setShowCommits(true) }} />
                        <HeaderMenuItem nested icon={<GitBranch className="size-4" />} label="待提交文件" hint="git status · 查看未提交的改动" onClick={() => { setHeaderMenu(false); setShowGitStatus(true) }} />
                      </>
                    )}
                    <HeaderMenuItem nested icon={<FolderTree className="size-4" />} label="合并工作区" hint="软链接聚合多个目录" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'taskspace' ? 'none' : 'taskspace') }} />
                    <HeaderMenuItem nested icon={<GitBranch className="size-4" />} label="拉取项目到工作区" hint="git clone 远端仓库到工作区" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'clone' ? 'none' : 'clone') }} />
                    <HeaderMenuItem nested icon={<ListChecks className="size-4" />} label="项目初始化流水线" hint="拉取→画像→知识图谱→profile→聚合" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'onboard' ? 'none' : 'onboard') }} />
                  </MenuSection>
                  <MenuSection icon={<Settings className="size-4" />} label="系统 · 设置" open={menuGroup === 'system'} onToggle={() => toggle('system')}>
                    <HeaderMenuItem nested icon={<Server className="size-4" />} label="服务商" hint="第三方网关(按会话,不动官方)" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'providers' ? 'none' : 'providers') }} />
                    <HeaderMenuItem nested icon={<Package className="size-4" />} label="插件更新" hint="查看/更新双端插件" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'plugins' ? 'none' : 'plugins') }} />
                    <HeaderMenuItem nested icon={<Bell className="size-4" />} label="通知设置" onClick={() => { setHeaderMenu(false); setPanel(p => p === 'settings' ? 'none' : 'settings') }} />
                    <HeaderMenuItem nested icon={<FileText className="size-4" />} label="最新日志" hint="后端+sidecar 日志，一键复制排查" onClick={() => { setHeaderMenu(false); setShowLogs(true) }} />
                    <HeaderMenuItem nested icon={<Bug className="size-4" />} label="调试模式" hint="实时交互日志（前端↔后端收发事件）" onClick={() => { setHeaderMenu(false); setShowDebug(true) }} />
                    <HeaderMenuItem nested icon={<RotateCw className="size-4" />} label="重启服务" hint="经守护进程重启后端" onClick={() => { setHeaderMenu(false); openRestart() }} />
                  </MenuSection>
                  </>) })()}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 折叠面板 */}
      {panel === 'new' && (
        <div className="border-b px-3 py-3">
          <label className="text-xs text-[var(--color-muted-foreground)]">工作目录（先选工作区 → 选项目，或手填路径；留空用 home）</label>
          {/* 第 1 级：工作区（多个 root 时才显示） */}
          {wsRoots.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {wsRoots.map((r, i) => {
                const rname = r.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || r.root
                return (
                  <button
                    key={r.root}
                    type="button"
                    title={r.root}
                    onClick={() => setWsIdx(i)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${i === wsIdx
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                      : 'text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40'}`}
                  >
                    {rname}
                  </button>
                )
              })}
            </div>
          )}
          {/* 第 2 级：该工作区下的一级目录（只显示项目名，选中即设为 cwd） */}
          {activeRoot && activeRoot.dirs.length > 0 && (
            <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {activeRoot.dirs.map(d => (
                <button
                  key={d.path}
                  type="button"
                  title={d.path}
                  onClick={() => setNewCwd(d.path)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${newCwd === d.path
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40'}`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder="或手填路径，例如 D:/Users/zhang/IdeaProjects/kai-toolbox"
              value={newCwd}
              onChange={e => setNewCwd(e.target.value)}
            />
            <Button size="lg" className="shadow-md" onClick={startNew}>开始</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--color-muted-foreground)]">引擎</span>
            {(['claude', 'codex', 'gemini', 'opencode'] as Engine[]).map(eng => (
              <button
                key={eng}
                type="button"
                onClick={() => setNewEngine(eng)}
                className={`rounded-full border px-3 py-1 text-xs ${newEngine === eng
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'bg-[var(--color-background)] text-[var(--color-muted-foreground)]'}`}
              >
                {engineName(eng)}
              </button>
            ))}
            {newEngine === 'codex' && (
              <span className="text-xs text-[var(--color-muted-foreground)]">（Codex 靠沙箱，不弹权限框）</span>
            )}
            {newEngine === 'gemini' && (
              <span className="text-xs text-[var(--color-muted-foreground)]">（Gemini CLI headless，需本机已登录 gemini 或配置 GEMINI_API_KEY）</span>
            )}
            {newEngine === 'opencode' && (
              <span className="text-xs text-[var(--color-muted-foreground)]">（多 provider agent，跑第三方模型推荐；需本机装 opencode 并配置 provider：opencode auth login）</span>
            )}
          </div>
          {/* OpenCode 引擎：provider/鉴权由 opencode 自己管理，这里只填模型 providerID/modelID */}
          {newEngine === 'opencode' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">模型</span>
              <input
                value={newModel}
                onChange={e => setNewModel(e.target.value)}
                placeholder="provider/model，如 anthropic/claude-sonnet-4-5 或 openai/gpt-4o（留空用 opencode 默认）"
                className="h-8 flex-1 rounded-md border bg-[var(--color-background)] px-2 text-sm"
              />
            </div>
          )}
          {/* 服务商：Claude / Codex / Gemini 引擎。官方默认 / 第三方网关档案（按会话生效，不动官方） */}
          {(newEngine === 'claude' || newEngine === 'codex' || newEngine === 'gemini') && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--color-muted-foreground)]">服务商</span>
                <button
                  type="button"
                  onClick={() => { setNewProviderId(''); setNewModel('') }}
                  className={`rounded-full border px-3 py-1 text-xs ${newProviderId === ''
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'bg-[var(--color-background)] text-[var(--color-muted-foreground)]'}`}
                >
                  官方默认
                </button>
                {providers.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setNewProviderId(p.id); setNewModel(p.model || '') }}
                    className={`rounded-full border px-3 py-1 text-xs ${newProviderId === p.id
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'bg-[var(--color-background)] text-[var(--color-muted-foreground)]'}`}
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPanel('providers')}
                  className="rounded-full border border-dashed px-3 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--color-accent)]"
                >
                  管理…
                </button>
              </div>
              {newProviderId !== '' && (
                <div className="mt-2 space-y-1.5">
                  {/* 平台筛选（二级）：先选平台，下面下拉只列该平台型号 */}
                  {providerModelGroups.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">平台</span>
                      <PlatformChip active={newModelPlatform === 'all'} onClick={() => setNewModelPlatform('all')}>
                        全部 {providerModels.length}
                      </PlatformChip>
                      {providerModelGroups.map(g => (
                        <PlatformChip key={g.key} active={newModelPlatform === g.key} onClick={() => setNewModelPlatform(g.key)}>
                          {g.label} {g.models.length}
                        </PlatformChip>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">模型</span>
                    <input
                      list="claude-chat-provider-models"
                      value={newModel}
                      onChange={e => setNewModel(e.target.value)}
                      placeholder={providerModelsLoading
                        ? '正在拉取网关模型…'
                        : providerModels.length
                          ? '选择或输入模型…'
                          : '网关挂的模型名，如 claude-sonnet-4-5'}
                      className="h-8 flex-1 rounded-md border bg-[var(--color-background)] px-2 text-sm"
                    />
                    <datalist id="claude-chat-provider-models">
                      {shownNewModels.map(m => (
                        <option key={m.value} value={m.value}>{m.displayName || m.value}</option>
                      ))}
                    </datalist>
                  </div>
                </div>
              )}
              {newProviderId !== '' && !providerModelsLoading && providerModels.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  没拉到模型目录{providerModelsError ? `：${providerModelsError}` : ''}。可直接手填模型名。
                </p>
              )}
              {newProviderId !== '' && providerModels.length > 0 && (
                <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                  已从网关拉到 {providerModels.length} 个模型，可下拉选择。
                </p>
              )}
              {newProviderId !== '' && (
                <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {newEngine === 'codex'
                    ? '将使用第三方网关（OpenAI 兼容），不是本机 ~/.codex 官方登录。网关 baseURL 只填 host 即可，Codex 会自动补 /v1。'
                    : newEngine === 'gemini'
                      ? '将使用第三方网关（须 Google/Gemini 协议兼容），注入 GOOGLE_GEMINI_BASE_URL + GEMINI_API_KEY，不走本机官方登录。'
                      : '将使用第三方网关，不是 Claude Code 官方登录。'}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPanel('taskspace')}
            className="mt-3 flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            <FolderTree className="size-3.5" /> 合并多个目录为工作区（软链接聚合）
          </button>
        </div>
      )}
      {panel === 'taskspace' && (
        <TaskspacePanel
          onCreated={dir => { setNewCwd(dir); setPanel('new') }}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'clone' && (
        <CloneProjectPanel
          onCloned={dir => { setNewCwd(dir); setPanel('new') }}
          onClose={() => setPanel('none')}
        />
      )}
      {/* 工作目录：移动端用顶部折叠条；PC 端改用右侧常驻栏（见下方单会话视图右列，类 Codex） */}
      {panel === 'filetree' && chat.sessionId && (
        <div className="md:hidden">
          <FileTreePanel sessionId={chat.sessionId} onClose={() => setPanel('none')} onAddToChat={p => setDraft(d => d.trim() ? `${d} ${p}` : p)} />
        </div>
      )}
      {panel === 'onboard' && (
        <OnboardPipelinePanel
          onLaunch={(seed, cwd) => {
            // 开一个 Claude 会话（skill 依赖 Claude 端团队插件 + Bash）并投喂触发语，
            // 让 yoooni-onboard-pipeline 接管：open 先于 send 到达（已验证），真正一键。
            chat.open(cwd.trim(), undefined, undefined, 'claude')
            chat.send(seed)
            setPanel('none')
          }}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'providers' && (
        <ProviderProfilesPanel onClose={() => { setProviders(loadProfiles()); setPanel('new') }} />
      )}
      {panel === 'sessions' && (
        <div className="flex max-h-[55vh] flex-col border-b">
          <div className="flex items-center gap-1 px-3 pt-2">
            <TabBtn active={sessTab === 'tool'} onClick={() => setSessTab('tool')}>工具会话</TabBtn>
            <TabBtn active={sessTab === 'history'} onClick={() => setSessTab('history')}>本机历史</TabBtn>
            {sessTab === 'tool' && (
              <button
                type="button"
                onClick={() => { setSelecting(v => !v); setSelected(new Set()) }}
                className={`ml-auto rounded-full px-3 py-0.5 text-xs ${selecting
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'}`}
              >
                {selecting ? '取消多选' : '多选并看'}
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {sessTab === 'tool' ? (
              <>
                {!selecting && (
                  <RecentSessions
                    currentSessionId={chat.sessionId}
                    onSwitch={id => { chat.switchTo(id); setPanel('none') }}
                  />
                )}
                <SessionList
                  currentSessionId={chat.sessionId}
                  onSwitch={id => { chat.switchTo(id); setPanel('none') }}
                  selectable={selecting}
                  selectedIds={selected}
                  onToggleSelect={toggleSelect}
                />
              </>
            ) : (
              <HistoryList
                defaultCwd={newCwd}
                onPick={(sid, cwd) => { chat.resumeHistory(sid, cwd); setPanel('none') }}
              />
            )}
          </div>
          {selecting && sessTab === 'tool' && (
            <div className="flex items-center gap-2 border-t px-3 py-2">
              <span className="text-xs text-[var(--color-muted-foreground)]">已选 {selected.size} 个</span>
              <Button size="sm" className="ml-auto" disabled={selected.size === 0} onClick={enterMulti}>
                并行查看选中（{selected.size}）
              </Button>
            </div>
          )}
        </div>
      )}
      {panel === 'settings' && (
        <div className="max-h-[60vh] overflow-y-auto border-b">
          <NotifySettings onClose={() => setPanel('none')} />
        </div>
      )}
      {panel === 'plugins' && (
        <div className="max-h-[60vh] overflow-y-auto">
          <PluginPanel onClose={() => setPanel('none')} />
        </div>
      )}

      {panel === 'caps' && (
        <SessionCapsPanel
          skills={chat.skills}
          agents={chat.agents}
          mcpServers={chat.mcpServers}
          outputStyle={chat.outputStyle}
          slashCount={chat.slashCommands.length}
          engine={chat.currentEngine}
          onClose={() => setPanel('none')}
        />
      )}

      {/* 会话目录 git 提交记录（复用通用 CommitsPanel，按 sessionId 服务端解析 cwd） */}
      {showCommits && chat.sessionId && (
        <CommitsPanel
          title="会话目录"
          fetchRepos={() => listSessionGitRepos(chat.sessionId!)}
          fetchCommits={repo => listSessionCommits(chat.sessionId!, 50, repo).then(r => r.commits)}
          fetchDiff={(hash, repo) => getSessionCommitDiff(chat.sessionId!, hash, repo)}
          onClose={() => setShowCommits(false)}
        />
      )}

      {/* 待提交文件：git status 树形视图 */}
      {showGitStatus && chat.sessionId && (
        <GitStatusPanel
          title="会话目录"
          fetchStatus={repo => fetchSessionGitStatus(chat.sessionId!, repo)}
          fetchFileDiff={(filePath, x) => fetchSessionGitFileDiff(chat.sessionId!, filePath, x)}
          onClose={() => setShowGitStatus(false)}
        />
      )}

      {/* 最新日志：后端内存缓冲（含透传的 sidecar 日志），排查时一键复制 */}
      {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}

      {/* 手势自检：逐步测试摄像头/模型/识别，区分 bug 还是模型/网络/权限问题 */}
      {showGestureDebug && <GestureDebugPanel onClose={() => setShowGestureDebug(false)} />}
      {showDebug && <DebugPanel onClose={() => setShowDebug(false)} />}

      {/* 一键重启：应用内弹层（移动端 window.prompt 不可用，必须用页面内输入框收 token） */}
      {restartOpen && <RestartDialog onClose={() => setRestartOpen(false)} />}

      {/* 同步空洞提示：断线较久时部分消息已被服务端缓冲淘汰，回放补不回 */}
      {viewMode === 'single' && chat.syncWarning && (
        <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <span className="flex-1">{chat.syncWarning}</span>
          <button
            type="button"
            onClick={chat.dismissSyncWarning}
            aria-label="关闭提示"
            className="shrink-0 rounded px-1.5 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-800"
          >
            知道了
          </button>
        </div>
      )}

      {/* 主体：多会话分屏 / 单会话（左侧常驻会话导航 + 右侧消息流与输入） */}
      {viewMode === 'multi' ? (
        <MultiSessionView
          sessionIds={multiIds}
          onExit={() => setViewMode('single')}
          onRemove={id => setMultiIds(prev => {
            const next = prev.filter(x => x !== id)
            if (next.length === 0) setViewMode('single')
            return next
          })}
        />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* 常驻会话导航（md+ 显示，可折叠）：免去每次开右上角「会话」面板才能切历史会话 */}
          {railOpen ? (
            <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-background)] md:flex">
              <div className="flex items-center gap-1 border-b px-2 py-1.5">
                <span className="text-xs font-medium text-[var(--color-muted-foreground)]">会话</span>
                <button type="button" onClick={() => setPanel('new')} className="ml-auto rounded p-1 hover:bg-[var(--color-accent)]" aria-label="新建会话" title="新建会话">
                  <Plus className="size-4" />
                </button>
                <button type="button" onClick={() => setRailOpen(false)} className="rounded p-1 hover:bg-[var(--color-accent)]" aria-label="收起会话列表" title="收起">
                  <PanelLeftClose className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RecentSessions currentSessionId={chat.sessionId} onSwitch={id => chat.switchTo(id)} />
                <SessionList currentSessionId={chat.sessionId} onSwitch={id => chat.switchTo(id)} />
              </div>
            </aside>
          ) : (
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              className="hidden w-8 shrink-0 items-start justify-center border-r border-[var(--color-border)] bg-[var(--color-background)] pt-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] md:flex"
              aria-label="展开会话列表"
              title="展开会话列表"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}

          {/* 右侧：消息流 + 输入 */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {chat.sessionId ? (
              <MessageList
                items={chat.items}
                running={chat.running}
                onLoadEarlier={() => chat.loadHistory(false)}
                loadingEarlier={chat.historyLoading}
                exhausted={chat.historyExhausted}
                onFork={chat.forkSession}
                engineLabel={engineDisplayName(chat.currentEngine, chat.currentProviderKind)}
                onResumeCurrent={chat.resumeCurrent}
                onCleanRetry={chat.cleanRetry}
                onNewSession={currentSession ? () => {
                  // 会话 JSONL 文件丢失无法恢复时，在同目录新建一个干净的会话
                  chat.open(currentSession.cwd)
                } : undefined}
                turnTokens={chat.turnTokens}
                connState={chat.state}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[var(--color-muted-foreground)]">
                <p>选一个历史会话，或新建一个开始对话</p>
                <Button size="lg" className="shadow-md" onClick={() => setPanel('new')}>
                  <Plus className="size-4" /> 新建会话
                </Button>
              </div>
            )}

            {/* 第三方网关调用诊断（可展开）：核对实际命中的模型，仅第三方会话显示 */}
            {chat.sessionId && (
              <ProviderDiagPanel
                providerKind={chat.currentProviderKind}
                providerBaseUrl={chat.currentProviderBaseUrl}
                currentModel={chat.currentModel}
                diag={chat.providerDiag}
              />
            )}

            {/* 底部输入：白色悬浮输入条 + 主色上边框 + 顶部阴影 */}
            {chat.sessionId && (
              <div className="border-t border-[var(--color-border)] bg-[var(--color-muted)] shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.08)]">
          <QueuedList items={chat.queued} onRemove={chat.removeQueued} onClear={chat.clearQueued} />
          <AttachmentChips
            items={attachments}
            uploading={uploading}
            onRemove={id => setAttachments(prev => {
              const t = prev.find(a => a.id === id)
              if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl)
              return prev.filter(a => a.id !== id)
            })}
          />
          <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
            <ModeSwitch mode={chat.mode} onChange={chat.setMode} />
            {chat.currentEngine === 'codex' && (
              <CodexSessionOptions
                models={chat.models}
                model={chat.currentModel}
                reasoningEffort={chat.codexReasoningEffort}
                speed={chat.codexSpeed}
                disabled={chat.running}
                onModelChange={chat.setModel}
                onOptionsChange={chat.setCodexOptions}
              />
            )}
            {chat.mode === 'bypassPermissions' && (
              <button
                type="button"
                onClick={toggleAutoApprove}
                title="全自动下：弹出的权限框自动点「允许」（仅权限框；AskUserQuestion 提问不自动应答）"
                aria-label="弹窗自动允许开关"
                className={'flex items-center gap-1 rounded-md border px-2 py-1 text-xs '
                  + (autoApprove
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'text-[var(--color-muted-foreground)]')}
              >
                <ShieldCheck className="size-3.5" /> 弹窗自动允许·{autoApprove ? '开' : '关'}
              </button>
            )}
            {/* 服务商切换与权限组语义不同：用左外边距推到右侧，避免和权限按钮挤在一起 */}
            <div className="ml-auto">
              <ProviderSwitch
                engine={chat.currentEngine}
                providerKind={chat.currentProviderKind}
                providerBaseUrl={chat.currentProviderBaseUrl}
                onSwitch={chat.switchProvider}
                onPickModel={chat.setModel}
                align="right"
              />
            </div>
          </div>
          {showSlash && (
            <SlashCommandMenu commands={slashFiltered} activeIndex={slashActive} onPick={pickSlash} />
          )}
          <div className="flex items-end gap-2 px-3 py-2">
            {/* 微信式「+ 更多功能」：附件 / 指令收纳其中 */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setMoreOpen(o => !o); setCmdMenuOpen(false) }}
                aria-label="更多功能"
                title="更多功能（附件 / 指令）"
              >
                <Plus className={`size-5 transition-transform${moreOpen ? ' rotate-45' : ''}`} />
              </Button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-44 rounded-xl border bg-[var(--color-card)] p-2 shadow-lg">
                    <div className="grid grid-cols-2 gap-1">
                      {/* 附件：label 包 input，保留原生触发（移动端 WebView 不丢手势） */}
                      <label
                        aria-label="添加附件"
                        title="添加图片 / 文档"
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-2.5 text-xs hover:bg-[var(--color-accent)]${attachments.length + uploading >= MAX_ATTACHMENTS ? ' pointer-events-none opacity-50' : ''}`}
                      >
                        <input
                          ref={fileRef}
                          type="file"
                          multiple
                          className="sr-only"
                          disabled={attachments.length + uploading >= MAX_ATTACHMENTS}
                          onChange={e => { handleFiles(e.target.files); setMoreOpen(false) }}
                        />
                        <Paperclip className="size-5 text-[var(--color-primary)]" />
                        附件
                      </label>
                      {/* 指令：打开斜杠命令菜单 */}
                      <button
                        type="button"
                        onClick={() => { setMoreOpen(false); setCmdMenuOpen(true) }}
                        className="flex flex-col items-center gap-1.5 rounded-lg p-2.5 text-xs hover:bg-[var(--color-accent)]"
                      >
                        <Slash className="size-5 text-[var(--color-primary)]" />
                        指令
                      </button>
                    </div>
                  </div>
                </>
              )}
              {cmdMenuOpen && (
                <CommandMenu
                  commands={chat.slashCommands}
                  models={chat.models}
                  currentModel={chat.currentModel}
                  engine={chat.currentEngine}
                  onClose={() => setCmdMenuOpen(false)}
                  onPickCommand={cmd => { setDraft('/' + cmd + ' '); setCmdMenuOpen(false) }}
                  onPickAssistant={prompt => { setDraft(prompt); setCmdMenuOpen(false) }}
                  onPickModel={value => { chat.setModel(value); setCmdMenuOpen(false) }}
                  onRefreshModels={chat.refreshModels}
                  modelsRefreshing={chat.modelsRefreshing}
                />
              )}
            </div>
            <VoiceInputButton
              onText={t => setDraft(d => d.trim() ? `${d} ${t}` : t)}
            />
            <textarea
              ref={taRef}
              className="max-h-32 min-h-[2.75rem] flex-1 resize-none overflow-y-auto rounded-xl border bg-[var(--color-background)] px-3 py-2 text-sm"
              placeholder=""
              rows={1}
              value={draft}
              onChange={e => { setDraft(e.target.value); setSlashDismissed(false); setSlashIdx(0) }}
              onPaste={handlePaste}
              onKeyDown={e => {
                // slash 菜单打开时：方向键导航、Enter/Tab 选中、Esc 关闭
                if (showSlash) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % slashFiltered.length); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + slashFiltered.length) % slashFiltered.length); return }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSlash(slashFiltered[slashActive]); return }
                  if (e.key === 'Escape') { e.preventDefault(); setSlashDismissed(true); return }
                }
                // 触屏（移动端）：回车换行、由发送按钮发；桌面：Enter 发送/排队、Shift+Enter 换行
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return
                  e.preventDefault()
                  submit() // running 时 submit 自动入队
                }
              }}
            />
            {chat.running ? (
              <div className="flex gap-1.5">
                <Button
                  size="lg"
                  variant="secondary"
                  className="shadow-sm"
                  onClick={submit}
                  disabled={!draft.trim() && attachments.length === 0}
                  aria-label="排队发送"
                  title="加入待发送队列，本轮结束后自动发出"
                >
                  <Plus className="size-4" />
                </Button>
                <Button variant="outline" size="lg" onClick={chat.interrupt} aria-label="中断">
                  <Square className="size-4" />
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                className="shadow-md"
                onClick={submit}
                disabled={!draft.trim() && attachments.length === 0}
                aria-label="发送"
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
            )}
          </div>
          {/* PC 端右侧文件树栏（类 Codex）：与聊天并排；移动端改用上方顶部折叠条 */}
          {panel === 'filetree' && chat.sessionId && (
            <div className="hidden shrink-0 md:flex">
              <FileTreePanel sessionId={chat.sessionId} onClose={() => setPanel('none')} variant="side" onAddToChat={p => setDraft(d => d.trim() ? `${d} ${p}` : p)} />
            </div>
          )}
        </div>
      )}

      {/* 本地用量弹层 */}
      {showUsage && <UsagePanel onClose={() => setShowUsage(false)} session={sessionUsage} />}

      {/* 可视化决策弹窗（仅单会话视图；分屏下各块自管弹窗） */}
      {viewMode === 'single' && pending?.kind === 'permission' && (
        <PermissionDialog
          toolName={pending.toolName}
          input={pending.input}
          onAllow={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })}
          onDeny={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
        />
      )}
      {viewMode === 'single' && pending?.kind === 'question' && (
        <QuestionDialog
          questions={pending.questions}
          onCancel={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
          onSubmit={answers => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow', answers })}
        />
      )}
    </div>
  )
}

/** 平台筛选小胶囊（新建会话模型按平台二级筛选）。 */
function PlatformChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'rounded-full border px-2 py-0.5 text-[11px] ' + (active
        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
        : 'bg-[var(--color-background)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]')}
    >
      {children}
    </button>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-t-md px-3 py-1.5 text-sm ' +
        (active ? 'border-b-2 border-[var(--color-primary)] font-medium' : 'text-[var(--color-muted-foreground)]')
      }
    >
      {children}
    </button>
  )
}

