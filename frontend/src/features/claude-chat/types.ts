// 与后端 tool-claude-chat 的 WS 协议对齐（见 api-current.md §2）

export type SessionStatus = 'RUNNING' | 'IDLE' | 'INTERRUPTED' | 'DONE'

export type PendingSqlStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED'

export type PendingSqlChangeType = 'DDL' | 'DML' | 'MIXED'

export type DdlEvidenceStatus =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'DDL_MISSING'
  | 'PROJECT_AMBIGUOUS'
  | 'STALE'
  | 'NOT_CHECKED'

/** Vibe Coding 会话关联的 SQL 台账；状态由用户维护，平台不会执行其中脚本。 */
export interface SessionPendingSql {
  sessionId: string
  title: string | null
  targetEnvironment: string | null
  changeType: PendingSqlChangeType
  sqlText: string
  status: PendingSqlStatus
  createdAt: number
  updatedAt: number
  executedAt: number | null
  ddlEvidenceStatus: DdlEvidenceStatus
  ddlProject: string | null
  ddlBaselinePath: string | null
  ddlEvidenceId: string | null
  ddlVerifiedTables: string[]
  ddlMissingTables: string[]
  ddlCheckedAt: number | null
}

/** 当前 Vibe Coding 会话专属的临时测试站点。 */
export interface SessionCustomSite {
  id: string
  title: string
  siteUrl: string
}

/** 会话测试站点聚合配置，兼容全局快捷入口关联和临时站点。 */
export interface SessionSiteConfiguration {
  quickSiteIds: string[]
  customSites: SessionCustomSite[]
}

export type ProviderKind = 'official' | 'thirdParty'

export interface ClaudeChatSessionView {
  id: string
  cwd: string
  title: string | null
  sdkSessionId: string | null
  /** 会话引擎 claude/codex（旧会话可能无此字段，按 claude 处理） */
  engine?: Engine
  /** 本会话先后用过的引擎有序列（如 'claude,codex'），用于列表标记多 agent */
  engines?: string
  /** Claude 服务商：official=Claude Code 官方登录；thirdParty=Anthropic 兼容第三方网关 */
  providerKind?: ProviderKind
  /** 第三方网关 baseURL（仅展示用；后端不会回传 authToken） */
  providerBaseUrl?: string | null
  /** 官方 Codex 会话绑定的授权目录；空值表示使用默认目录 */
  codexHome?: string | null
  /** 会话所属分组名（后端持久化，跨端可见）；空/缺省=未分组 */
  group?: string | null
  /** 二级需求分组；一级 group 通常表示系统/项目。 */
  subgroup?: string | null
  /** 用户重点收藏，收藏会话在所属需求分组内优先展示。 */
  favorite?: boolean
  status: SessionStatus
  startedAt: number
  lastSeenAt: number
  /** true = 仍挂在活跃 sidecar 上，可 attach 接回进行中的一轮 */
  live: boolean
  /** 规划已过期时，所有输入入口必须保持锁定。 */
  planExpired?: boolean
  /** 最近一次标记规划过期的时间。 */
  planExpiredAt?: number | null
  /** 最近一次显式解锁的时间。 */
  planUnlockedAt?: number | null
}

/** 磁盘上的 Claude Code 历史会话（~/.claude/projects/<编码cwd>/*.jsonl） */
export interface HistorySessionView {
  sdkSessionId: string
  cwd: string | null
  title: string
  lastModified: number
  messageCount: number
}

/** 一个工作区一级项目：displayName 展示，path 作为新建会话 cwd。 */
export interface WorkspaceDir {
  name: string
  path: string
  alias?: string | null
  displayName?: string
}

/** 工作目录扫描结果：每个配置根一条，含其一级子目录。 */
export interface WorkspaceList {
  roots: { root: string; exists: boolean; dirs: WorkspaceDir[] }[]
  scannedAt: string
}

/** 「自维护机器人」锁定的 kai-toolbox 自身仓库路径；exists=false 时前端隐藏机器人入口。 */
export interface SelfRepo {
  path: string
  exists: boolean
}

/** 拉取项目结果：name=克隆目录名，path=落地绝对路径（可直接当新建会话 cwd）。 */
export interface CloneResult {
  name: string
  path: string
}

/** 项目内识别出的一个可工作模块。children 为知识库声明的嵌套子模块。 */
export interface ProjectModule {
  name: string
  relPath: string
  absPath: string
  type: string
  /** 业务说明（来自知识库；自动识别的模块为空） */
  summary?: string
  /** 嵌套子模块（如 crm 域下的子模块）；无则空数组或缺省 */
  children?: ProjectModule[]
  /** 后端代码目录绝对路径（知识库模块来自 modules.json；自动识别=模块目录）；无则空串 */
  codePath?: string
  /** 前端代码目录绝对路径（知识库模块来自 modules.json）；无则空串。用于新建会话时约束编码范围 */
  webPath?: string
  /** 前端代码目录绝对路径集合；兼容知识库中的 webPath 与 webPaths */
  webPaths?: string[]
}

/** 会话工作目录文件树里的一个条目。path 为相对 cwd（/ 分隔），回传给后端展开/读取/定位；abs 为绝对路径。 */
export interface FileEntry {
  name: string
  path: string
  /** 绝对路径，供「复制路径」「添加到聊天」。 */
  abs: string
  dir: boolean
  size: number
  mtime: number
}

/** 文本文件预览内容。binary=true 时 content 为空（二进制不预览）。 */
export interface FileContent {
  name: string
  path: string
  size: number
  binary: boolean
  truncated: boolean
  content: string
}

/** 「项目初始化流水线」(yoooni-onboard-pipeline) 里单仓的探测线索。 */
export interface OnboardRepo {
  path: string
  exists: boolean
  role: string
  stack: string[]
  encoding: string
}

/** 流水线一个阶段的进度。status：done/pending/skipped。 */
export interface OnboardStage {
  id: string
  name: string
  /** full=自动 / semi=AI起草+人确认 / human=人判定 */
  auto: string
  gate: string
  status: string
  /** 完成时间 ISO，可空 */
  at: string | null
}

/** 一次 onboard 的进度视图，镜像 ~/.kai-toolbox/onboard-<系统>.json（后端只读）。 */
export interface OnboardView {
  system: string
  separated: boolean
  createdAt: string | null
  repos: OnboardRepo[]
  stages: OnboardStage[]
}

/** 项目模块扫描结果，用于项目工作台按模块打开 Vibe Coding 会话。 */
export interface ProjectModules {
  project: string
  projectPath: string
  exists: boolean
  /** 项目类型代码（maven/gradle/node/go/rust/python/java-web/knowledge/unknown），供着色 */
  projectType?: string
  /** 项目类型中文标签，供项目工作台右上角展示「这是什么项目」 */
  projectTypeLabel?: string
  /** 本次模块是否来自知识库 modules.json（false=按构建文件自动识别兜底） */
  fromKnowledge?: boolean
  /** 当前配置的知识库根目录（project-domain-knowledge 的 knowledge/ 目录）；未配置为空串 */
  knowledgeBaseDir?: string
  /** 上述知识库根目录是否存在，供工作台提示用户配置 */
  knowledgeDirExists?: boolean
  modules: ProjectModule[]
}

/** 「更新项目模块」预览：按目录结构重新解析出的候选，与 modules.json 现清单的差异。 */
export interface ModuleSyncPreview {
  project: string
  projectPath: string
  exists: boolean
  /** 是否找到该项目的知识库 modules.json（否则无法在 UI 里更新，需走 CLI --code-base） */
  knowledgeConfigured: boolean
  /** 当前配置的知识库根目录（project-domain-knowledge 的 knowledge/ 目录）；未配置为空串 */
  knowledgeBaseDir: string
  /** 上述知识库根目录在磁盘上是否存在 */
  knowledgeDirExists: boolean
  currentCount: number
  added: { key: string; codePath: string; keyConflict: boolean }[]
  missing: { key: string; name: string; codePath: string }[]
}

/** 「更新项目模块」应用结果。 */
export interface ModuleSyncResult {
  appended: number
  skipped: number
  modulesFile: string
}

/** 团队初始化知识库目录的就绪检查结果。 */
export interface KnowledgeEnsureResult {
  /** ok=已就绪；disabled=尚未执行团队依赖初始化；其余值兼容旧版后端。 */
  status: 'ok' | 'bound' | 'cloned' | 'disabled' | 'error'
  kbDir: string
  target: string
  repoUrl: string
  message: string
}

/** 「模块路由」一条候选：把一句话定位到的 (项目, 模块)。 */
export interface ModuleCandidate {
  project: string
  projectPath: string
  module: ProjectModule
  /** 命中方式：exact / prefix / contains */
  match: string
}

/** 「模块路由」解析结果：candidates 0=未匹配，1=可直接确认，多=需选项目。 */
export interface ModuleResolve {
  query: string
  moduleHint: string
  projectHint: string
  candidates: ModuleCandidate[]
}

// ── 合并工作区 taskspace ──────────────────────────────────────────

/** taskspace 选目录时的一个子目录：isLink 标记其本身已是链接。 */
export interface TaskspaceDir {
  name: string
  path: string
  isLink: boolean
}

/** 列某父目录子目录的结果。 */
export interface SubdirList {
  parent: string
  exists: boolean
  dirs: TaskspaceDir[]
}

/** 工作区内一个成员链接：alive=链接当前是否仍存在。 */
export interface TaskspaceMember {
  link: string
  target: string
  alive: boolean
}

/** 一个合并工作区的视图：目录 + 清单 + 成员链接存活状态。 */
export interface TaskspaceView {
  dir: string
  name: string
  base: string
  members: TaskspaceMember[]
}

/** 随消息发送的附件引用：name 展示用，path 为上传响应里的服务端绝对路径。 */
export interface Attachment {
  name: string
  path: string
}

/** 用户消息气泡里展示的附件（缩略图）：url 为可显示地址（图片 object/data URL）。 */
export interface MsgAttachment {
  name: string
  mime?: string
  url?: string
}

/** 发送时携带的附件：WS 只用 name/path，url/mime 仅供本端气泡显示缩略图。 */
export type SendAttachment = Attachment & { mime?: string; url?: string }

/** 权限模式：与 sidecar Agent SDK 的 permissionMode 对齐。 */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

/** 会话引擎：claude（Claude Agent SDK）/ codex（OpenAI Codex SDK）/ gemini（Gemini CLI headless）。会话级固定。 */
export type Engine = 'claude' | 'codex' | 'gemini' | 'opencode'
export type CodexReasoningEffort = string
export type CodexSpeed = 'default' | 'fast'

/** team-standards 插件单端版本（installed/available 取不到为 null，error 为检测失败原因）。 */
export interface EnginePluginStatus {
  installed: string | null
  available: string | null
  error: string | null
}

/** 插件双端版本视图。 */
export interface PluginStatus {
  marketplace: string
  claude: EnginePluginStatus
  codex: EnginePluginStatus
}

/** 团队套件（插件 / MCP）在 Claude Code 端的状态。插件带版本；MCP 用知识库 git 状态表达版本/新鲜度。 */
export interface SuiteStatus {
  name: string
  kind: 'plugin' | 'mcp'
  marketplace: string | null
  /** 插件在 Claude / Codex 两端的已装版本（未装为 null）。 */
  claudeInstalled: string | null
  codexInstalled: string | null
  available: string | null
  /** 插件=任一端已安装；MCP=已在 ~/.claude.json 配置。 */
  present: boolean
  /** MCP 知识库本地短 commit（插件为 null）。 */
  repoCommit: string | null
  /** MCP 知识库本地提交日期 YYYY-MM-DD（插件为 null）。 */
  repoDate: string | null
  /** MCP 知识库落后远端的提交数：0=已最新；null=未知/无上游/未 fetch。 */
  behind: number | null
}

export interface TeamDependencyEnvironment {
  os: 'windows' | 'macos' | 'other'
  ready: boolean
  tools: Array<{
    id: 'git' | 'node' | 'claude' | 'codex'
    name: string
    installed: boolean
    version: string | null
    installCommand: string
    officialUrl: string
  }>
}

export interface TeamRepositoryStatus {
  name: string
  cloned: boolean
  source: 'gitee' | 'github' | 'other' | null
  sourceMatches: boolean
  commit: string | null
  commitDate: string | null
  lastSyncedAt: number | null
  behind: number | null
  ahead: number | null
  dirty: boolean
  remoteChecked: boolean
}

export type BusinessRepositoryStatusCode =
  | 'READY'
  | 'BEHIND'
  | 'NOT_CLONED'
  | 'DIRTY'
  | 'AHEAD'
  | 'DIVERGED'
  | 'REMOTE_MISMATCH'
  | 'INVALID_DIRECTORY'
  | 'DETACHED_HEAD'
  | 'NO_UPSTREAM'
  | 'ERROR'

export interface BusinessRepositoryStatus {
  name: string
  path: string
  repositoryUrl: string
  cloned: boolean
  sourceMatches: boolean
  branch: string | null
  commit: string | null
  commitDate: string | null
  behind: number | null
  ahead: number | null
  dirty: boolean
  remoteChecked: boolean
  syncable: boolean
  status: BusinessRepositoryStatusCode
  message: string
}

export interface BusinessSystemWorkspace {
  id: 'erp' | 'erp-mini-program' | 'srm' | 'scm'
  name: string
  workspaceName: string
  workspacePath: string
  ready: boolean
  status: 'READY' | 'PARTIAL' | 'NOT_CLONED' | 'BLOCKED'
  message: string
  members: BusinessRepositoryStatus[]
}

export interface SkillSyncResult {
  skill: string
  sourcePath: string
  sourceSha256: string
  targets: Array<{
    agent: 'claude' | 'codex'
    version: string | null
    targetPath: string | null
    status: 'updated' | 'missing' | 'failed'
    message: string
  }>
}

/** sidecar 中单个对话引擎运行包的版本状态。 */
export interface SidecarEngineVersion {
  id: 'claude' | 'codex' | 'gemini' | 'opencode'
  name: string
  packageName: string
  declared: string | null
  installed: string | null
  cliVersion: string | null
  latest: string | null
  outdated: boolean
  error: string | null
}

/** sidecar 四种对话引擎运行包的版本状态，顶层字段兼容旧 Claude 响应。 */
export interface SidecarVersion {
  /** package.json 里声明的范围 */
  declared: string | null
  /** node_modules 里实际装着的版本（运行期生效的那个） */
  installed: string | null
  /** 该 SDK 捆绑的 claude 二进制版本 */
  cliVersion: string | null
  /** npm 上最新版本；仅在点了「检查更新」后才有 */
  latest: string | null
  outdated: boolean
  upgradeCommand: string | null
  error: string | null
  engines?: SidecarEngineVersion[]
}

/** 可选模型信息（来自 SDK supportedModels）。value 用于 setModel，displayName/description 供展示。 */
export interface ModelInfo {
  value: string
  displayName: string
  description: string
  reasoningEfforts?: CodexReasoningEffort[]
  defaultReasoningEffort?: CodexReasoningEffort | null
  fastSupported?: boolean
  /** Codex App Server 标记的当前授权目录默认模型。 */
  isDefault?: boolean
}

// ── 客户端 → 服务端 ───────────────────────────────────────────────
export type ClientMessage =
  | {
      type: 'open'
      cwd: string
      model?: string
      mode?: PermissionMode
      engine?: Engine
      apiBaseUrl?: string
      authToken?: string
      codexHome?: string
      codexReasoningEffort?: CodexReasoningEffort
      codexSpeed?: CodexSpeed
      consultEvidenceSystems?: string[]
    }
  | { type: 'attach'; sessionId: string; lastEventSeq: number }
  | { type: 'switchSession'; sessionId: string }
  | { type: 'duplicateSession'; sourceSessionId: string; codexHome?: string }
  | { type: 'resumeHistory'; sdkSessionId: string; cwd: string }
  | { type: 'resumeCurrent'; sessionId?: string }
  | { type: 'send'; text: string; attachments?: Attachment[]; developerInstructions?: string }
  | {
      type: 'decision'
      reqId: string
      behavior: 'allow' | 'deny'
      updatedInput?: Record<string, unknown>
      answers?: Record<string, string | string[]>
    }
  | { type: 'interrupt' }
  | { type: 'setMode'; mode: PermissionMode }
  /** 「弹窗自动允许」：交由服务端保管并回灌 sidecar，放行在 sidecar 内同步完成，与页面在不在线无关。 */
  | { type: 'setAutoApprove'; autoApprove: boolean }
  | { type: 'setModel'; model: string }
  | { type: 'refreshModels' }
  | { type: 'refreshCapabilities' }
  | { type: 'setCodexOptions'; reasoningEffort: CodexReasoningEffort; speed: CodexSpeed }
  | { type: 'switchEngine'; engine: Engine }
  | { type: 'switchProvider'; apiBaseUrl?: string; authToken?: string }
  | { type: 'forkSession'; upToMessageId: string }

// ── AskUserQuestion 结构 ─────────────────────────────────────────
export interface Question {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiSelect: boolean
}

/** 会话上挂着的后台任务（Agent 工具后台化的子任务，如"先在后台调查，稍后告诉你"这类）。
 *  主回合的 result 事件只代表"这一轮可见回复结束了"，不代表后台工作也结束——这个字段用来区分两者。 */
export interface BackgroundTaskInfo {
  taskId: string
  taskType: string
  description: string
}

// ── 服务端 → 客户端（均带 seq）────────────────────────────────────
export type ServerMessage =
  | { type: 'ready'; seq: number; sessionId: string; sdkSessionId: string | null; slashCommands?: string[]; status?: SessionStatus; activeTurnId?: string | null; epoch?: string; engine?: Engine; providerKind?: ProviderKind; providerBaseUrl?: string | null; skills?: string[]; agents?: string[]; mcpServers?: { name: string; status: string }[]; outputStyle?: string | null; backgroundTasks?: BackgroundTaskInfo[]; selectedModel?: string | null; codexReasoningEffort?: CodexReasoningEffort | null; codexSpeed?: CodexSpeed | null; queueDispatchMode?: 'server' }
  | { type: 'assistantDelta'; seq: number; text: string }
  | { type: 'toolUse'; seq: number; toolCallId?: string | null; toolName: string; input: unknown }
  | { type: 'toolResult'; seq: number; toolCallId?: string | null; toolName: string; output: string; isError: boolean }
  | { type: 'permissionRequest'; seq: number; reqId: string; toolName: string; input: unknown }
  | { type: 'questionRequest'; seq: number; reqId: string; questions: Question[] }
  | { type: 'decisionResolved'; seq: number; reqId: string }
  | { type: 'models'; seq: number; models: ModelInfo[]; current: string | null }
  | { type: 'userMessage'; seq: number; uuid: string }
  | { type: 'forkAnchor'; seq: number; anchor: string }
  | { type: 'forked'; seq: number; sessionId: string }
  | { type: 'replayGap'; seq: number; missingFrom: number; missingTo: number }
  | { type: 'result'; seq: number; usage?: Record<string, unknown>; stopReason: string; traceId?: string | null }
  | { type: 'turnInfo'; seq: number; requestedModel: string | null; responseModel: string | null; viaGateway: boolean; baseUrl: string | null; transport?: CodexTransport | null }
  | { type: 'turnProgress'; seq: number; outputTokens: number }
  | { type: 'warning'; seq: number; code: string; message: string }
  | { type: 'toolActivity'; seq: number; toolCallId: string; toolName: string; status: string; title: string; detail?: string | null; elapsedMs?: number | null; outputTail?: string | null; outcome?: string | null; severity?: string | null }
  | { type: 'turnActivity'; seq: number; status: string; phase: string; title: string; detail?: string | null; elapsedMs?: number | null }
  | { type: 'codexActivity'; seq: number; activityType: string; itemId: string; status: string; title: string; detail?: string | null; data?: unknown }
  | { type: 'interruptState'; seq: number; outcome: string; active: boolean; pendingDecision: boolean }
  | { type: 'error'; seq: number; code: string; message: string; terminal?: boolean }
  /** 该会话后台任务的全量快照，收到即整体覆盖（REPLACE 语义）；空数组＝当前没有后台任务在跑。 */
  | { type: 'backgroundTasks'; seq: number; tasks: BackgroundTaskInfo[] }
  | { type: 'queueDispatched'; seq: number; messageId: string; text: string; displayText?: string | null; attachments?: Array<{ name: string; path: string; mime?: string | null }>; createdAt: number }
  | { type: 'pendingSessions'; seq: number; sessions: PendingSessionRef[] }

/** 全局跨会话待答项：某会话有未决权限/提问请求。kind=permission/question。 */
export interface PendingSessionRef {
  sessionId: string
  cwd: string
  kind: 'permission' | 'question'
  toolName?: string | null
  /** 用户给该会话设置的别名；未设置为 null/undefined，展示时应退化为 cwd。 */
  title?: string | null
}

/** 一轮调用诊断条目：请求模型 vs API 实际返回模型 + 是否经网关。供第三方会话「调用诊断」区块展示。 */
export interface TurnDiag {
  id: string
  requestedModel: string | null
  responseModel: string | null
  viaGateway: boolean
  baseUrl: string | null
  transport?: CodexTransport | null
}

export type CodexTransport = 'appServer' | 'sdkFallback' | 'thirdPartySdk'

// ── 渲染用的消息项 ───────────────────────────────────────────────
// ts：该消息块的时间（Unix ms）。实时消息=客户端发送/接收时刻；历史消息暂无（可空，UI 不显示）。
export type ChatItem =
  // displayText：可选的展示层覆盖——text 是实际发给 agent 的完整内容（含门控提示词等样板），
  // displayText 是用户真正想说的那句话；渲染只显示 displayText ?? text，text 仍原样发送/参与分叉续跑。
  // 目前只有实时会话里由 send() 发起时才可能带；历史回放（loadMessages）尚未持久化该覆盖，刷新/切回后会看到完整 text。
  | { kind: 'user'; id: string; text: string; displayText?: string; sdkUuid?: string; ts?: number; attachments?: MsgAttachment[] }
  | { kind: 'assistant'; id: string; text: string; forkAnchor?: string; ts?: number }
  | { kind: 'tool'; id: string; toolCallId?: string; toolName: string; input: unknown; output?: string; isError?: boolean; ts?: number }
  | { kind: 'result'; id: string; stopReason: string; traceId?: string | null; ts?: number; usage?: Record<string, number>; latencyMs?: number; ttftMs?: number }
  | { kind: 'warning'; id: string; code: string; message: string; ts?: number }
  | { kind: 'activity'; id: string; activityType: string; status: string; title: string; detail?: string | null; outcome?: string | null; severity?: string | null; data?: unknown; ts?: number }
  | { kind: 'error'; id: string; code: string; message: string; ts?: number }

// ── 待决策（权限 / 提问），驱动弹窗 ───────────────────────────────
export type PendingRequest =
  | { kind: 'permission'; reqId: string; toolName: string; input: unknown }
  | { kind: 'question'; reqId: string; questions: Question[] }

export type ConnState = 'idle' | 'connecting' | 'ready' | 'closed' | 'error'

// ── 通知配置（存 feature-config "claude-chat" 项下的 notify 子树）──
export interface NotifyConfig {
  notify: {
    bark: { enabled: boolean; baseUrl: string; deviceKey: string }
    ntfy: { enabled: boolean; baseUrl: string; topic: string }
  }
}

export const NOTIFY_DEFAULTS: NotifyConfig = {
  notify: {
    bark: { enabled: false, baseUrl: 'https://api.day.app', deviceKey: '' },
    ntfy: { enabled: false, baseUrl: 'https://ntfy.sh', topic: '' },
  },
}
