import { ApiError, http, authFetch, subscribeSsePost } from '@/lib/api'
import type { SseHandlers } from '@/lib/api'
import type {
  CreateSessionRequest,
  DevDocVersionSummary,
  PrdSessionView,
  ProgressVersionSummary,
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

/** 重命名会话标题（历史列表里的需求标题）。 */
export const updateSessionTitle = (id: string, title: string) =>
  http<PrdSessionView>(`${BASE}/sessions/${id}/title`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  })

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

/**
 * SSE 流式：生成/更新技术开发方案文档。
 * extraInstructions：用户在确认弹框里补充的自定义提示词/更新说明（可选）。
 * updateExisting：true = 基于当前已有开发文档做增量更新（覆盖前自动备份旧版本），
 *                 false/undefined = 从 PRD 从零生成/覆盖（原有行为）。
 * qaHistory：update 模式下 DevDocUpdateDialog 多轮澄清产出的问答记录（可选），结构化传给
 *            后端持久化进这一版的生成记录，跟 PRD 首次澄清记录（session.questions）分开存。
 */
export const startGenerateDevDoc = (
  id: string,
  extraInstructions: string | undefined,
  updateExisting: boolean | undefined,
  qaHistory: QaPair[] | undefined,
  handlers: SseHandlers,
) =>
  subscribeSsePost(`/prd-clarify/sessions/${id}/dev-doc`, { extraInstructions, updateExisting, qaHistory }, handlers)

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

/**
 * 列出该会话开发文档的所有版本摘要（以磁盘上实际存在的备份文件为准，早于「生成记录」
 * 功能上线的旧版本也会出现在列表里，只是 mode/extraInstructions 为 null）。
 */
export const listDevDocVersions = (id: string) =>
  http<DevDocVersionSummary[]>(`${BASE}/sessions/${id}/dev-doc/versions`)

/** 读取开发文档某个历史版本的内容（与 getDevDocContent 同格式）。version 对应生成记录里的版本号。 */
export const getDevDocVersionContent = async (id: string, version: number): Promise<string> => {
  const res = await authFetch(`/prd-clarify/sessions/${id}/dev-doc/versions/${version}`)
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

/**
 * AI 工时评估：基于当前 PRD + 当前开发文档（结合代码/业务知识图谱查询结果）评估开发工时。
 * 同步阻塞请求（一次 oneShot LLM 调用，无 SSE），extraContext 是确认弹框里补充的上下文
 * （如团队人力、技术栈熟悉度），可不传。返回更新后的会话详情（含最新 devDocEstimation）。
 */
export const estimateDevDocEffort = (id: string, extraContext?: string) =>
  http<PrdSessionView>(`${BASE}/sessions/${id}/dev-doc/estimate`, {
    method: 'POST',
    body: JSON.stringify({ extraContext }),
  })

// ─── 进度评估 ───
// 平台的 PRD/开发文档是业务/技术事实来源，进度评估报告是基于它们 + 代码知识图谱核对出的
// 派生产物，按版本追加落盘（不覆盖），用法完全对齐"开发文档"那一组接口。

/**
 * SSE 流式：基于当前 PRD + 开发文档核对代码库实际实现进度，生成大纲固定的 Markdown 报告。
 * extraContext：确认弹框里补充的核对重点（如"重点核对库存流水是否已实现"），可不传。
 */
export const evaluateProgress = (
  id: string,
  extraContext: string | undefined,
  handlers: SseHandlers,
) =>
  subscribeSsePost(`${BASE}/sessions/${id}/progress/evaluate`, { extraContext }, handlers)

/** 读取当前进度评估文档内容（与 getContent 同格式）。 */
export const getProgressContent = async (id: string): Promise<string> => {
  const res = await authFetch(`/prd-clarify/sessions/${id}/progress`)
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

/** 列出该会话进度评估的所有版本摘要（以磁盘上实际存在的备份文件为准）。 */
export const listProgressVersions = (id: string) =>
  http<ProgressVersionSummary[]>(`${BASE}/sessions/${id}/progress/versions`)

/** 读取进度评估某个历史版本的内容（与 getProgressContent 同格式）。version 对应评估记录里的版本号。 */
export const getProgressVersionContent = async (id: string, version: number): Promise<string> => {
  const res = await authFetch(`/prd-clarify/sessions/${id}/progress/versions/${version}`)
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

/** 关联 Vibe Coding 开发会话 ID 到 PRD 会话（由 claude-chat handoff handler 回写）。 */
export const linkDevSession = (prdSessionId: string, devSessionId: string) =>
  http<{ ok: boolean }>(`/prd-clarify/sessions/${prdSessionId}/link-dev-session`, {
    method: 'POST',
    body: JSON.stringify({ devSessionId }),
  })

/** 取消关联 Vibe Coding 开发会话（{@link linkDevSession} 的反操作），供聊天窗口「关联 PRD」面板的「取消关联」用。 */
export const unlinkDevSession = (prdSessionId: string) =>
  http<{ ok: boolean }>(`/prd-clarify/sessions/${prdSessionId}/unlink-dev-session`, {
    method: 'POST',
  })

/**
 * 按 Vibe Coding 开发会话 ID 反查关联的 PRD 会话（{@link linkDevSession} 的反向查询）。
 * 未绑定是正常状态（大多数会话都没绑），后端返回 404，这里转成 null 而不是抛错，
 * 调用方（claude-chat 聊天窗口）不用为"没绑定"这个常见情况写 try/catch。
 */
export const getSessionByDevSession = async (devSessionId: string): Promise<PrdSessionView | null> => {
  try {
    return await http<PrdSessionView>(`${BASE}/sessions/by-dev-session/${devSessionId}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

/**
 * {@link getSessionByDevSession} 的批量版本：一次性查一批开发会话 id 各自绑没绑 PRD。
 * 供 claude-chat 会话列表（RecentSessions / SessionList）给每一行标"已关联 PRD"小图标用，
 * 避免给每一行单独发一次请求（N+1）。返回 Map：devSessionId -> PrdSessionView，
 * 未绑定的 id 不会出现在结果里。devSessionIds 为空数组时直接返回空对象，不发请求。
 */
export const getSessionsByDevSessions = async (devSessionIds: string[]): Promise<Record<string, PrdSessionView>> => {
  if (devSessionIds.length === 0) return {}
  const qs = devSessionIds.map(id => encodeURIComponent(id)).join(',')
  return http<Record<string, PrdSessionView>>(`${BASE}/sessions/by-dev-sessions?ids=${qs}`)
}

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

// ─── Vibe Coding 澄清 ───

/** sessionStorage key，用于 prd-clarify → claude-chat 的澄清 handoff */
export const PRD_CLARIFY_LAUNCH_KEY = 'kai-toolbox:claude-chat:prd-clarify-launch'

/**
 * 检查 Claude 是否已通过 Vibe Coding 写入 PRD 文件。
 * 若已写入则后端自动更新状态为 DONE，前端可据此跳转到编辑器。
 */
export const checkPrdFile = (id: string) =>
  http<PrdSessionView>(`${BASE}/sessions/${id}/check-prd-file`, { method: 'POST' })

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

export interface ImageAttachmentResult {
  id: string
  name: string
  mime: string
  /** 可直接用于 <img src> 的相对地址（GET /api/prd-clarify/attachments/image/{id}） */
  url: string
}

/**
 * "原始需求描述"文本域直接粘贴图片：落盘后返回可用于 <img src> 的地址，前端把
 * `![粘贴图片N](url)` 插进文本域光标处，图片随文字一起构成 rawInput。
 */
export const uploadImageAttachment = async (file: File): Promise<ImageAttachmentResult> => {
  const form = new FormData()
  form.append('file', file)
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('toolbox.auth.token') : null
  const res = await fetch('/api/prd-clarify/attachments/image', {
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

/**
 * 开发文档更新前的多轮渐进澄清：请求 Claude 就"更新说明相对当前开发文档还有哪里不明确"
 * 提出下一个问题（SSE 流式），用法与 askNextQuestion 一致。updateNotes 每轮都会带上。
 */
export const askNextDevDocQuestion = (
  sessionId: string,
  questionIndex: number,
  history: QaPair[],
  updateNotes: string,
  handlers: SseHandlers,
) =>
  subscribeSsePost(`/prd-clarify/sessions/${sessionId}/dev-doc/ask`, { questionIndex, history, updateNotes }, handlers)
