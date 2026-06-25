import { authFetch, http } from '@/lib/api'
import type { CommitDiff, CommitsResponse } from '@/components/git/types'
import type { ChatItem, ClaudeChatSessionView, CloneResult, HistorySessionView, ModelInfo, ModuleResolve, NotifyConfig, PluginStatus, SuiteStatus, ProjectModules, SubdirList, TaskspaceView, WorkspaceList } from './types'

/** 列当前会话工作目录(git 仓库)的最近提交。后端按 sessionId 解析 cwd。 */
export function listSessionCommits(sessionId: string, limit?: number) {
  const qs = limit ? `?limit=${limit}` : ''
  return http<CommitsResponse>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/git/commits${qs}`)
}

/** 取会话目录某提交的 diff。 */
export function getSessionCommitDiff(sessionId: string, hash: string) {
  return http<CommitDiff>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/git/commit?hash=${encodeURIComponent(hash)}`)
}

/**
 * 取后端最近日志（含透传进来的 sidecar 日志），用于排查时一键复制贴给 AI。
 * 返回纯文本（后端 text/plain）。mode：error=最近告警+上下文（默认）/ all=最近全量。
 */
export async function fetchRecentLogs(mode: 'error' | 'all' = 'error', limit = 200): Promise<string> {
  const qs = new URLSearchParams({ mode, limit: String(limit) })
  const res = await authFetch(`/system/logs?${qs.toString()}`)
  if (!res.ok) {
    throw new Error(res.status === 401 ? '未登录或登录已过期，无法读取日志' : `读取日志失败：HTTP ${res.status}`)
  }
  return res.text()
}

export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  totalTokens: number
  turns: number
}

/** 整会话累计用量：后端读 transcript 求和，按 sessionId 返回准确总和（不受前端分页影响）。 */
export function fetchSessionUsage(sessionId: string) {
  return http<SessionUsage>(`/claude-chat/history/${encodeURIComponent(sessionId)}/usage`)
}

/** 查 team-standards 在 Claude/Codex 两端的版本。 */
export function getPluginStatus() {
  return http<PluginStatus>('/claude-chat/plugins/status')
}

/** 列团队套件状态（3 插件 + 2 MCP，当前会话所用）。fetch=true 时先 git fetch MCP 知识库，使「落后远端」准确（较慢）。 */
export function listSuites(fetch = false) {
  return http<SuiteStatus[]>(`/claude-chat/plugins/suites${fetch ? '?fetch=true' : ''}`)
}

/** 一键更新双端插件的 SSE 端点路径（用 authEventSource 连接，自动带 JWT；连上即触发）。 */
export const PLUGIN_UPDATE_STREAM_PATH = '/claude-chat/plugins/update/stream'

/** 用当前（草稿）配置触发后端发一条测试推送，返回实际尝试的渠道（bark / ntfy）。 */
export function testServerPush(config: NotifyConfig) {
  return http<{ channels: string[] }>('/claude-chat/notify/test', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export function listSessions() {
  return http<ClaudeChatSessionView[]>('/claude-chat/sessions')
}

/** 拉第三方网关的可用模型目录（后端代理 GET {baseUrl}/v1/models，避免浏览器 CORS）。error 非空=拉取失败原因。 */
export function fetchProviderModels(baseUrl: string, key: string) {
  return http<{ models: ModelInfo[]; error?: string | null }>('/claude-chat/provider/models', {
    method: 'POST',
    body: JSON.stringify({ baseUrl, key }),
  })
}

/** 列出配置根目录下的一级子目录，供新建会话选 cwd。 */
export function listWorkspaces() {
  return http<WorkspaceList>('/claude-chat/workspaces')
}

/** 拉取（git clone）新项目到指定工作区根（须为配置的 workspace 根之一），返回落地路径可直接当 cwd。 */
export function cloneProject(url: string, root: string) {
  return http<CloneResult>('/claude-chat/workspaces/clone', {
    method: 'POST',
    body: JSON.stringify({ url, root }),
  })
}

/** 某项目下的模块（确定性扫描，按构建标志文件）。供「项目工作台」列模块、懒建会话。 */
export function fetchProjectModules(path: string) {
  return http<ProjectModules>(`/claude-chat/workspaces/modules?path=${encodeURIComponent(path)}`)
}

/** 模块路由：把一句自然语言确定性解析为候选 (项目, 模块)，供「说一句话拉起模块会话」。 */
export function resolveModule(q: string) {
  return http<ModuleResolve>(`/claude-chat/workspaces/resolve?q=${encodeURIComponent(q)}`)
}

// ── 合并工作区 taskspace：父目录多选 → 建软链接聚合成新工作区 ──────────

/** 列任意父目录的一级子目录，供多选。 */
export function listTaskspaceSubdirs(parent: string) {
  return http<SubdirList>(`/claude-chat/taskspace/subdirs?parent=${encodeURIComponent(parent)}`)
}

/** 在 base 下创建 name 工作区，为每个 member 目录建链接。 */
export function createTaskspace(base: string, name: string, members: string[]) {
  return http<TaskspaceView>('/claude-chat/taskspace/create', {
    method: 'POST',
    body: JSON.stringify({ base, name, members }),
  })
}

/** 读工作区清单 + 链接存活状态。 */
export function getTaskspaceInfo(dir: string) {
  return http<TaskspaceView>(`/claude-chat/taskspace/info?dir=${encodeURIComponent(dir)}`)
}

/** 向工作区追加链接。 */
export function addTaskspaceMembers(dir: string, members: string[]) {
  return http<TaskspaceView>('/claude-chat/taskspace/add', {
    method: 'POST',
    body: JSON.stringify({ dir, members }),
  })
}

/** 从工作区移除若干链接（只删链接，不动源目录）。 */
export function removeTaskspaceLinks(dir: string, links: string[]) {
  return http<TaskspaceView>('/claude-chat/taskspace/remove', {
    method: 'POST',
    body: JSON.stringify({ dir, links }),
  })
}

/** 整体拆除工作区（只删链接 + 清单，源目录不触碰）。 */
export function teardownTaskspace(dir: string) {
  return http<void>('/claude-chat/taskspace/teardown', {
    method: 'POST',
    body: JSON.stringify({ dir }),
  })
}

export function deleteSession(id: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** 重命名工具会话（改 SQLite title）。 */
export function renameSession(id: string, title: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/title`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  })
}

/** 重命名本机历史会话（自定义别名；空串=清除，回落解析标题）。 */
export function renameHistory(sdkSessionId: string, alias: string) {
  return http<void>(`/claude-chat/history/${encodeURIComponent(sdkSessionId)}/alias`, {
    method: 'PUT',
    body: JSON.stringify({ alias }),
  })
}

/** 删除本机历史会话（移到回收目录，可恢复）。 */
export function deleteHistory(sdkSessionId: string, cwd: string) {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  return http<void>(`/claude-chat/history/${encodeURIComponent(sdkSessionId)}${qs}`, {
    method: 'DELETE',
  })
}

/** 列出某 cwd 在磁盘上的 Claude Code 历史会话 */
export function listHistory(cwd: string) {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  return http<HistorySessionView[]>(`/claude-chat/history${qs}`)
}

// ── 语音 / 附件：二进制 / multipart 传输，http() 的 JSON 封装不适用，改走 authFetch（仍带 JWT）──
async function errMessage(res: Response): Promise<string> {
  let msg = `HTTP ${res.status}`
  try {
    const j = await res.json()
    msg = (j && (j.message || j.error)) || msg
  } catch { /* 非 JSON */ }
  return msg
}

// ── 引擎本地用量 ───────────────────────────────────────────────
export interface UsageWindow {
  input: number; output: number; cacheRead: number; cacheCreate: number
  total: number; turns: number; sessions: number; cacheHitRate: number | null
}
export interface UsageQuota {
  primaryUsedPercent: number | null; primaryWindowMinutes: number | null; primaryResetsAt: number | null
  secondaryUsedPercent: number | null; secondaryWindowMinutes: number | null; secondaryResetsAt: number | null
  planType: string | null
  /** 相较上一次读数的百分点增量（最近一次 token 增量对应的窗口涨幅），可空 */
  primaryDeltaPercent?: number | null
  secondaryDeltaPercent?: number | null
}
export interface EngineUsage {
  engine: string; available: boolean; hasTokens: boolean; note: string | null
  today: UsageWindow; d7: UsageWindow; d30: UsageWindow; quota: UsageQuota | null
}

/** 拉三引擎本地用量（今日/近7天/近30天 + Codex 官方额度）。 */
export function fetchUsage(): Promise<EngineUsage[]> {
  return http<EngineUsage[]>('/claude-chat/usage')
}

/** 探测 faster-whisper ASR 是否就绪，用于启用/禁用麦克风按钮。 */
export async function sttAvailable(): Promise<boolean> {
  try {
    const res = await authFetch('/claude-chat/stt/available')
    if (!res.ok) return false
    const j = await res.json()
    return !!j.available
  } catch {
    return false
  }
}

/** 上传录音音频，返回转写文本。 */
export async function transcribe(audio: Blob, language = 'auto'): Promise<string> {
  const res = await authFetch(`/claude-chat/stt?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'application/octet-stream' },
    body: audio,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  const j = await res.json()
  return j.text ?? ''
}

/** 探测本地 Kokoro TTS 是否就绪；未就绪时语音模式回落到合成动画（AI 不出声）。 */
export async function ttsAvailable(): Promise<boolean> {
  try {
    const res = await authFetch('/claude-chat/tts/available')
    if (!res.ok) return false
    const j = await res.json()
    return !!j.available
  } catch {
    return false
  }
}

/** 合成语音：文本 → wav 字节（ArrayBuffer），供语音模式播放并驱动云团振幅。 */
export async function synthesize(text: string, voice?: string): Promise<ArrayBuffer> {
  const qs = voice ? `?voice=${encodeURIComponent(voice)}` : ''
  const res = await authFetch(`/claude-chat/tts${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  return res.arrayBuffer()
}

export interface UploadedAttachment {
  id: string
  name: string
  mime: string
  size: number
  path: string
}

/** 上传单个附件，落盘到会话 cwd 专用目录，返回句柄。 */
export async function uploadAttachment(sessionId: string, file: File): Promise<UploadedAttachment> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await authFetch(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/attachments`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  return res.json()
}

// ── 历史会话消息分页加载 ──────────────────────────────────────────
interface RawHistoryMessage {
  id: string
  kind: string
  text?: string
  toolName?: string
  input?: unknown
  output?: string
  isError?: boolean
  stopReason?: string
  ts?: number | null
  usage?: Record<string, number> | null
  latencyMs?: number | null
}

/** 分页读取某会话历史消息，转成渲染用 ChatItem。before 空=最近一页；否则取更早一页。 */
export async function loadMessages(
  sdkSessionId: string,
  cwd: string,
  before?: number | null,
  limit = 30,
): Promise<{ items: ChatItem[]; nextBefore: number | null }> {
  const qs = new URLSearchParams()
  if (cwd) qs.set('cwd', cwd)
  if (before != null) qs.set('before', String(before))
  qs.set('limit', String(limit))
  const page = await http<{ items: RawHistoryMessage[]; nextBefore: number | null }>(
    `/claude-chat/history/${encodeURIComponent(sdkSessionId)}/messages?${qs.toString()}`,
  )
  return { items: page.items.map(toChatItem), nextBefore: page.nextBefore }
}

function toChatItem(m: RawHistoryMessage): ChatItem {
  const ts = m.ts ?? undefined
  switch (m.kind) {
    case 'assistant':
      return { kind: 'assistant', id: m.id, text: m.text ?? '', ts }
    case 'tool':
      return { kind: 'tool', id: m.id, toolName: m.toolName ?? '', input: m.input ?? null, output: m.output ?? undefined, isError: m.isError ?? undefined, ts }
    case 'result':
      return { kind: 'result', id: m.id, stopReason: m.stopReason ?? 'end_turn', ts, usage: m.usage ?? undefined, latencyMs: m.latencyMs ?? undefined }
    default:
      return { kind: 'user', id: m.id, text: m.text ?? '', ts }
  }
}
