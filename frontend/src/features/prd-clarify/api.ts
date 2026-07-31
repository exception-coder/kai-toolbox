import { ApiError, http, authFetch, subscribeSsePost } from '@/lib/api'
import type { SseHandlers } from '@/lib/api'
import type {
  CreateSessionRequest,
  DevDocVersionSummary,
  PrdSessionView,
  ProgressVersionSummary,
  SaveContentRequest,
  SaveDraftRequest,
  SplitItem,
  SplitPreview,
  SubmitAnswersRequest,
} from './types'
export {
  parsePrdAttachment as parseAttachment,
  uploadPrdImage as uploadImageAttachment,
} from '@/lib/prdAttachments'
export type {
  PrdAttachmentParseResult as AttachmentParseResult,
  PrdImageAttachmentResult as ImageAttachmentResult,
} from '@/lib/prdAttachments'

const BASE = '/prd-clarify'

/** 创建 PRD 澄清会话。 */
export const createSession = (req: CreateSessionRequest) =>
  http<PrdSessionView>(`${BASE}/sessions`, {
    method: 'POST',
    body: JSON.stringify(req),
  })

/** 保存草稿（仅标题/需求描述/关联项目模块，不判定需求类型/澄清深度/模式）。 */
export const saveDraft = (req: SaveDraftRequest) =>
  http<PrdSessionView>(`${BASE}/sessions/draft`, {
    method: 'POST',
    body: JSON.stringify(req),
  })

/** 再次保存草稿（覆盖字段，状态保持 DRAFT）。 */
export const updateDraft = (id: string, req: SaveDraftRequest) =>
  http<PrdSessionView>(`${BASE}/sessions/${id}/draft`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })

/** 草稿转正式：原地把 DRAFT 会话切到 CLARIFYING（不新建记录）。 */
export const startClarifyFromDraft = (id: string, req: CreateSessionRequest) =>
  http<PrdSessionView>(`${BASE}/sessions/${id}/start-from-draft`, {
    method: 'POST',
    body: JSON.stringify(req),
  })

/** AI 需求拆分预览：判断当前需求是否"过大"，建议拆成多个子需求。只读分析，不落库。 */
export const splitRequirement = (id: string) =>
  http<SplitPreview>(`${BASE}/sessions/${id}/split`, { method: 'POST' })

/** 采纳拆分结果：把确认（可能编辑过）的子需求批量创建成 DRAFT 草稿，挂在当前会话下面。 */
export const adoptSplit = (id: string, items: SplitItem[]) =>
  http<PrdSessionView[]>(`${BASE}/sessions/${id}/split/adopt`, {
    method: 'POST',
    body: JSON.stringify({ items }),
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
 * SSE：触发 PRD 生成/更新阶段。事件同上：chunk / done / error。
 * extraInstructions/updateExisting 用法跟 {@link startGenerateDevDoc} 对齐：
 * updateExisting=true 时基于当前已有 PRD 内容做增量更新（旧版本自动备份），
 * extraInstructions 是这次更新说明；缺省即原有行为——从原始需求描述+澄清问答从零生成。
 */
export const startGenerate = (
  id: string,
  handlers: SseHandlers,
  extraInstructions?: string,
  updateExisting?: boolean,
  engine?: 'claude' | 'codex',
) =>
  subscribeSsePost(`${BASE}/sessions/${id}/generate`, { extraInstructions, updateExisting, engine }, handlers)

// ─── 开发文档 ───

/**
 * SSE 流式：生成/更新技术开发方案文档。
 * extraInstructions：用户在确认弹框里补充的自定义提示词/更新说明（可选）。
 * updateExisting：true = 基于当前已有开发文档做增量更新（覆盖前自动备份旧版本），
 *                 false/undefined = 从 PRD 从零生成/覆盖（原有行为）。
 * qaHistory：本次 TDD 生成/更新前的技术澄清问答，跟 PRD 业务澄清记录分开存。
 * clarificationCompleted：必须为 true；即使 AI 判断无需追问，也表示已走完 TDD 澄清关卡。
 */
export const startGenerateDevDoc = (
  id: string,
  extraInstructions: string | undefined,
  updateExisting: boolean | undefined,
  qaHistory: QaPair[] | undefined,
  clarificationCompleted: boolean,
  handlers: SseHandlers,
  engine?: 'claude' | 'codex',
) =>
  subscribeSsePost(
    `/prd-clarify/sessions/${id}/dev-doc`,
    { extraInstructions, updateExisting, qaHistory, clarificationCompleted, engine },
    handlers,
  )

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

// ─── Vibe Coding 文档变更候选 ───

export type DocChangeDecision = 'NONE' | 'PRD_ONLY' | 'TDD_ONLY' | 'BOTH' | 'UNCERTAIN'
export type DocChangeStatus = 'PENDING' | 'CONFIRMED' | 'APPLYING' | 'PARTIAL' | 'APPLIED' | 'DISMISSED' | 'NO_UPDATE'
export type DocChangeStage = 'NONE' | 'PRD' | 'TDD' | 'DONE'

export interface PrdDocChangeCandidate {
  id: string
  prdSessionId: string
  devSessionId: string
  conversationFromSeq: number
  conversationToSeq: number
  decision: DocChangeDecision
  aiDecision: DocChangeDecision
  summary: string
  reasoning: string
  evidence: string[]
  prdPatchPlan: string[]
  tddPatchPlan: string[]
  risks: string[]
  clarificationQuestion: string
  confidence: number
  status: DocChangeStatus
  applyStage: DocChangeStage
  lastError: string | null
  prdAppliedAt: number | null
  tddAppliedAt: number | null
  createdAt: number
  updatedAt: number
}

export type CandidateStageAction =
  | 'CONFIRM'
  | 'START_PRD'
  | 'PRD_SUCCESS'
  | 'START_TDD'
  | 'TDD_SUCCESS'
  | 'PRD_ONLY_SUCCESS'
  | 'FAIL'
  | 'DISMISS'
  | 'NO_UPDATE'

/** 分析上次同步点之后的开发对话与 Git 快照；相同快照由后端幂等复用。 */
export const analyzeDocChanges = (prdSessionId: string) =>
  http<PrdDocChangeCandidate>(`${BASE}/sessions/${prdSessionId}/change-candidates/analyze`, {
    method: 'POST',
  })

/** 恢复最近一次候选和分阶段执行断点。没有候选时后端返回 null。 */
export const getLatestDocChangeCandidate = (prdSessionId: string) =>
  http<PrdDocChangeCandidate | undefined>(`${BASE}/sessions/${prdSessionId}/change-candidates/latest`)

/** 用户覆写 AI 建议范围；aiDecision 保持原值供审计。 */
export const overrideDocChangeDecision = (candidateId: string, decision: DocChangeDecision) =>
  http<PrdDocChangeCandidate>(`${BASE}/change-candidates/${candidateId}/decision`, {
    method: 'PUT',
    body: JSON.stringify({ decision }),
  })

/** 回答当前唯一阻塞问题后重新分析。 */
export const reanalyzeDocChanges = (candidateId: string, answer: string) =>
  http<PrdDocChangeCandidate>(`${BASE}/change-candidates/${candidateId}/reanalyze`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })

/** 记录确认、阶段开始/成功/失败、暂不处理或无需更新。 */
export const updateDocChangeStage = (candidateId: string, action: CandidateStageAction, error?: string) =>
  http<PrdDocChangeCandidate>(`${BASE}/change-candidates/${candidateId}/stage`, {
    method: 'POST',
    body: JSON.stringify({ action, error }),
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

// ─── Vibe Coding 澄清 ───

/** sessionStorage key，用于 prd-clarify → claude-chat 的澄清 handoff */
export const PRD_CLARIFY_LAUNCH_KEY = 'kai-toolbox:claude-chat:prd-clarify-launch'

/**
 * 检查 Claude 是否已通过 Vibe Coding 写入 PRD 文件。
 * 若已写入则后端自动更新状态为 DONE，前端可据此跳转到编辑器。
 */
export const checkPrdFile = (id: string) =>
  http<PrdSessionView>(`${BASE}/sessions/${id}/check-prd-file`, { method: 'POST' })

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
 * 批量澄清的「一次性回答」：把用户写成一整段的回答交给模型拆分归位到各题。
 *
 * <p>只返回分配结果、不落库——填进输入框后仍由用户逐题核对修改，落库照旧走 saveQaHistory 自动保存。
 */
export const distributeAnswer = (sessionId: string, rawAnswer: string) =>
  http<import('./types').AnswerDistribution>(`/prd-clarify/sessions/${sessionId}/distribute-answer`, {
    method: 'POST',
    body: JSON.stringify({ rawAnswer }),
  })

/**
 * TDD 生成/更新前的多轮渐进澄清。initial 核对编码前必须明确的技术决策，
 * update 核对更新说明相对当前 TDD 的实现歧义。
 */
export const askNextDevDocQuestion = (
  sessionId: string,
  questionIndex: number,
  history: QaPair[],
  updateNotes: string,
  mode: 'initial' | 'update',
  handlers: SseHandlers,
  engine?: 'claude' | 'codex',
) =>
  subscribeSsePost(
    `/prd-clarify/sessions/${sessionId}/dev-doc/ask`,
    { questionIndex, history, updateNotes, mode, engine },
    handlers,
  )
