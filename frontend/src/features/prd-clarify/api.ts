import { http, authFetch, subscribeSsePost } from '@/lib/api'
import type { SseHandlers } from '@/lib/api'
import type {
  CreateSessionRequest,
  PrdSessionView,
  SaveContentRequest,
  SubmitAnswersRequest,
} from './types'

const BASE = '/prd-clarify'

/** 创建 PRD 澄清会话。 */
export const createSession = (req: CreateSessionRequest) =>
  http<PrdSessionView>(`${BASE}/sessions`, {
    method: 'POST',
    body: JSON.stringify(req),
  })

/** 获取单个会话详情。 */
export const getSession = (id: string) => http<PrdSessionView>(`${BASE}/sessions/${id}`)

/** 获取历史列表（最近 50 条）。 */
export const listSessions = () => http<PrdSessionView[]>(`${BASE}/sessions`)

/** 删除会话（含 .md 文件）。 */
export const deleteSession = (id: string) =>
  http<void>(`${BASE}/sessions/${id}`, { method: 'DELETE' })

/** 提交用户对澄清问题的答案。 */
export const submitAnswers = (id: string, req: SubmitAnswersRequest) =>
  http<PrdSessionView>(`${BASE}/sessions/${id}/answers`, {
    method: 'POST',
    body: JSON.stringify(req),
  })

/**
 * 读取 .md 文件内容。
 *
 * 使用 authFetch + res.text() 而非 http() + res.json()，
 * 兼容后端两种 Content-Type：
 *   - text/plain（旧行为）：直接读 text
 *   - application/json（新行为，produces = APPLICATION_JSON_VALUE）：
 *     读 text 后 JSON.parse 去掉外层引号
 * 无论后端是否重启，都能正确拿到 Markdown 内容。
 */
export const getContent = async (id: string): Promise<string> => {
  const res = await authFetch(`${BASE}/sessions/${id}/content`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!text) return ''
  // 如果后端返回 JSON 字符串格式（带引号），则解析去掉引号；否则直接返回
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'string' ? parsed : text
  } catch {
    return text
  }
}

/** 保存编辑后的 .md 文件。 */
export const saveContent = (id: string, req: SaveContentRequest) =>
  http<void>(`${BASE}/sessions/${id}/content`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })

/**
 * SSE：触发澄清阶段（生成 5 个问题）。
 * 事件：chunk（content 增量）、done（完成）、error（失败）。
 * 使用 subscribeSsePost 以便携带 Authorization header。
 */
export const startClarify = (id: string, handlers: SseHandlers) =>
  subscribeSsePost(`${BASE}/sessions/${id}/clarify`, {}, handlers)

/**
 * SSE：触发 PRD 生成阶段。
 * 事件同上：chunk / done / error。
 */
export const startGenerate = (id: string, handlers: SseHandlers) =>
  subscribeSsePost(`${BASE}/sessions/${id}/generate`, {}, handlers)

// ─── 开发文档 ───

/** SSE 流式：基于 PRD 生成技术开发方案文档（四章节）。 */
export const startGenerateDevDoc = (id: string, handlers: SseHandlers) =>
  subscribeSsePost(`/prd-clarify/sessions/${id}/dev-doc`, {}, handlers)

/** 读取开发文档内容（与 getContent 同格式）。 */
export const getDevDocContent = async (id: string): Promise<string> => {
  const res = await authFetch(`/prd-clarify/sessions/${id}/dev-doc`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!text) return ''
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'string' ? parsed : text
  } catch {
    return text
  }
}

/** 保存编辑后的开发文档。 */
export const saveDevDocContent = (id: string, content: string) =>
  http<void>(`/prd-clarify/sessions/${id}/dev-doc`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })

/** 关联 Vibe Coding 开发会话 ID 到 PRD 会话（由 claude-chat handoff handler 回写）。 */
export const linkDevSession = (prdSessionId: string, devSessionId: string) =>
  http<{ ok: boolean }>(`/prd-clarify/sessions/${prdSessionId}/link-dev-session`, {
    method: 'POST',
    body: JSON.stringify({ devSessionId }),
  })

/**
 * 将 PRD 会话关联到需求管理池条目（来自需求池的跳入场景，PRD 生成完成后回调）。
 * 触发 reqpool 条目状态流转到 PRD_READY。
 */
export const linkPrdToReqItem = (reqItemId: string, prdSessionId: string) =>
  http<void>(`/reqpool/items/${reqItemId}/link-prd`, {
    method: 'POST',
    body: JSON.stringify({ prdSessionId }),
  })

/**
 * PRD 澄清助手生成完成后，自动在需求管理池注册一条 PRD_READY 状态的需求记录。
 * 用于「PRD澄清助手 → 自动同步到需求管理池」场景（不经过需求池创建的独立 PRD）。
 */
export const autoRegisterToReqPool = (params: {
  title: string
  description?: string
  project?: string
  module?: string
  prdSessionId: string
}) =>
  http<{ id: string }>('/reqpool/items', {
    method: 'POST',
    body: JSON.stringify({
      title: params.title,
      description: params.description ?? '',
      project: params.project ?? '',
      module: params.module ?? '',
      priority: 'MEDIUM',
      prdSessionId: params.prdSessionId,
    }),
  })

// ─── 附件解析 ───

export interface AttachmentParseResult {
  fileName: string
  contentType: string
  text: string
  truncated: boolean
}

/**
 * 上传附件（MD / PDF / DOCX）并解析提取文本。
 * 返回结构化的解析结果，由前端拼接到 rawInput 中。
 */
export const parseAttachment = async (file: File): Promise<AttachmentParseResult> => {
  const form = new FormData()
  form.append('file', file)
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('toolbox.auth.token') : null
  const res = await fetch('/api/prd-clarify/attachments/parse', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── 多轮渐进式澄清 ───

export interface QaPair { question: string; answer: string }

/**
 * 多轮澄清：请求 Claude 生成下一个问题（SSE 流式）。
 * Claude 可能输出 [CLARIFICATION_COMPLETE] 表示信息已足够。
 */
export const askNextQuestion = (
  sessionId: string,
  questionIndex: number,
  history: QaPair[],
  handlers: SseHandlers,
) =>
  subscribeSsePost(`/prd-clarify/sessions/${sessionId}/ask`, { questionIndex, history }, handlers)

/**
 * 多轮澄清完成，保存完整问答历史（含每题的问题文本），以便 generate 使用。
 */
export const saveQaHistory = (sessionId: string, history: QaPair[]) =>
  http<import('./types').PrdSessionView>(`/prd-clarify/sessions/${sessionId}/qa-history`, {
    method: 'POST',
    body: JSON.stringify({ history }),
  })
