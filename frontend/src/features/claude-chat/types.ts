// 与后端 tool-claude-chat 的 WS 协议对齐（见 api-current.md §2）

export type SessionStatus = 'RUNNING' | 'IDLE' | 'INTERRUPTED' | 'DONE'

export interface ClaudeChatSessionView {
  id: string
  cwd: string
  title: string | null
  sdkSessionId: string | null
  /** 会话引擎 claude/codex（旧会话可能无此字段，按 claude 处理） */
  engine?: Engine
  /** 本会话先后用过的引擎有序列（如 'claude,codex'），用于列表标记多 agent */
  engines?: string
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

/** 权限模式：与 sidecar Agent SDK 的 permissionMode 对齐。 */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

/** 会话引擎：claude（Claude Agent SDK）/ codex（OpenAI Codex SDK）/ gemini（Gemini CLI headless）。会话级固定。 */
export type Engine = 'claude' | 'codex' | 'gemini'

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

/** 可选模型信息（来自 SDK supportedModels）。value 用于 setModel，displayName/description 供展示。 */
export interface ModelInfo {
  value: string
  displayName: string
  description: string
}

// ── 客户端 → 服务端 ───────────────────────────────────────────────
export type ClientMessage =
  | { type: 'open'; cwd: string; model?: string; mode?: PermissionMode; engine?: Engine; apiBaseUrl?: string; authToken?: string }
  | { type: 'attach'; sessionId: string; lastEventSeq: number }
  | { type: 'switchSession'; sessionId: string }
  | { type: 'resumeHistory'; sdkSessionId: string; cwd: string }
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
  | { type: 'switchEngine'; engine: Engine }
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
  | { type: 'ready'; seq: number; sessionId: string; sdkSessionId: string | null; slashCommands?: string[]; status?: SessionStatus; epoch?: string; engine?: Engine }
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
  | { type: 'error'; seq: number; code: string; message: string }

// ── 渲染用的消息项 ───────────────────────────────────────────────
export type ChatItem =
  | { kind: 'user'; id: string; text: string; sdkUuid?: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; toolName: string; input: unknown; output?: string; isError?: boolean }
  | { kind: 'result'; id: string; stopReason: string }
  | { kind: 'error'; id: string; code: string; message: string }

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
