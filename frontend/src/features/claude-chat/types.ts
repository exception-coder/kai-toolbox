// 与后端 tool-claude-chat 的 WS 协议对齐（见 api-current.md §2）

export type SessionStatus = 'RUNNING' | 'IDLE' | 'INTERRUPTED' | 'DONE'

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
  /** 会话所属分组名（后端持久化，跨端可见）；空/缺省=未分组 */
  group?: string | null
  status: SessionStatus
  startedAt: number
  lastSeenAt: number
  /** true = 仍挂在活跃 sidecar 上，可 attach 接回进行中的一轮 */
  live: boolean
}

/** 磁盘上的 Claude Code 历史会话（~/.claude/projects/<编码cwd>/*.jsonl） */
export interface HistorySessionView {
  sdkSessionId: string
  cwd: string | null
  title: string
  lastModified: number
  messageCount: number
}

/** 一个一级子目录：name 展示，path 作为新建会话 cwd。 */
export interface WorkspaceDir {
  name: string
  path: string
}

/** 工作目录扫描结果：每个配置根一条，含其一级子目录。 */
export interface WorkspaceList {
  roots: { root: string; exists: boolean; dirs: WorkspaceDir[] }[]
  scannedAt: string
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
export type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
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

/** 可选模型信息（来自 SDK supportedModels）。value 用于 setModel，displayName/description 供展示。 */
export interface ModelInfo {
  value: string
  displayName: string
  description: string
  reasoningEfforts?: CodexReasoningEffort[]
  defaultReasoningEffort?: CodexReasoningEffort | null
  fastSupported?: boolean
}

// ── 客户端 → 服务端 ───────────────────────────────────────────────
export type ClientMessage =
  | { type: 'open'; cwd: string; model?: string; mode?: PermissionMode; engine?: Engine; apiBaseUrl?: string; authToken?: string }
  | { type: 'attach'; sessionId: string; lastEventSeq: number }
  | { type: 'switchSession'; sessionId: string }
  | { type: 'resumeHistory'; sdkSessionId: string; cwd: string }
  | { type: 'resumeCurrent'; sessionId?: string }
  | { type: 'send'; text: string; attachments?: Attachment[] }
  | {
      type: 'decision'
      reqId: string
      behavior: 'allow' | 'deny'
      updatedInput?: Record<string, unknown>
      answers?: Record<string, string | string[]>
    }
  | { type: 'interrupt' }
  | { type: 'setMode'; mode: PermissionMode }
  | { type: 'setModel'; model: string }
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

// ── 服务端 → 客户端（均带 seq）────────────────────────────────────
export type ServerMessage =
  | { type: 'ready'; seq: number; sessionId: string; sdkSessionId: string | null; slashCommands?: string[]; status?: SessionStatus; epoch?: string; engine?: Engine; providerKind?: ProviderKind; providerBaseUrl?: string | null; skills?: string[]; agents?: string[]; mcpServers?: { name: string; status: string }[]; outputStyle?: string | null }
  | { type: 'assistantDelta'; seq: number; text: string }
  | { type: 'toolUse'; seq: number; toolName: string; input: unknown }
  | { type: 'toolResult'; seq: number; toolName: string; output: string; isError: boolean }
  | { type: 'permissionRequest'; seq: number; reqId: string; toolName: string; input: unknown }
  | { type: 'questionRequest'; seq: number; reqId: string; questions: Question[] }
  | { type: 'decisionResolved'; seq: number; reqId: string }
  | { type: 'models'; seq: number; models: ModelInfo[]; current: string | null }
  | { type: 'userMessage'; seq: number; uuid: string }
  | { type: 'forked'; seq: number; sessionId: string }
  | { type: 'replayGap'; seq: number; missingFrom: number; missingTo: number }
  | { type: 'result'; seq: number; usage?: Record<string, unknown>; stopReason: string }
  | { type: 'turnInfo'; seq: number; requestedModel: string | null; responseModel: string | null; viaGateway: boolean; baseUrl: string | null }
  | { type: 'turnProgress'; seq: number; outputTokens: number }
  | { type: 'error'; seq: number; code: string; message: string }

/** 一轮调用诊断条目：请求模型 vs API 实际返回模型 + 是否经网关。供第三方会话「调用诊断」区块展示。 */
export interface TurnDiag {
  id: string
  requestedModel: string | null
  responseModel: string | null
  viaGateway: boolean
  baseUrl: string | null
}

// ── 渲染用的消息项 ───────────────────────────────────────────────
// ts：该消息块的时间（Unix ms）。实时消息=客户端发送/接收时刻；历史消息暂无（可空，UI 不显示）。
export type ChatItem =
  | { kind: 'user'; id: string; text: string; sdkUuid?: string; ts?: number; attachments?: MsgAttachment[] }
  | { kind: 'assistant'; id: string; text: string; ts?: number }
  | { kind: 'tool'; id: string; toolName: string; input: unknown; output?: string; isError?: boolean; ts?: number }
  | { kind: 'result'; id: string; stopReason: string; ts?: number; usage?: Record<string, number>; latencyMs?: number; ttftMs?: number }
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
