import { authFetch, http } from '@/lib/api'
import type { ChatItem, ClaudeChatSessionView, HistorySessionView, NotifyConfig, PluginStatus, WorkspaceList } from './types'

/** 查 team-standards 在 Claude/Codex 两端的版本。 */
export function getPluginStatus() {
  return http<PluginStatus>('/claude-chat/plugins/status')
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

/** 列出配置根目录下的一级子目录，供新建会话选 cwd。 */
export function listWorkspaces() {
  return http<WorkspaceList>('/claude-chat/workspaces')
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
  switch (m.kind) {
    case 'assistant':
      return { kind: 'assistant', id: m.id, text: m.text ?? '' }
    case 'tool':
      return { kind: 'tool', id: m.id, toolName: m.toolName ?? '', input: m.input ?? null, output: m.output ?? undefined, isError: m.isError ?? undefined }
    case 'result':
      return { kind: 'result', id: m.id, stopReason: m.stopReason ?? 'end_turn' }
    default:
      return { kind: 'user', id: m.id, text: m.text ?? '' }
  }
}
