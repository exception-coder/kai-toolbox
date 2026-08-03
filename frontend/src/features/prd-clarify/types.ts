/** PRD 澄清工具的 TypeScript 类型定义 */

/** DRAFT：草稿，仅存了标题/关联项目模块/需求描述，尚未发起澄清（"待生成 PRD"）。 */
export type PrdSessionStatus = 'DRAFT' | 'CLARIFYING' | 'GENERATING' | 'DONE' | 'ERROR'

/** 提需求方角色，决定 Claude 澄清问题的深度和语言风格 */
export type PrdRole = 'PRODUCT' | 'BUSINESS'

/**
 * 需求类型，决定「问什么」和「生成什么结构的文档」（跟 PrdRole 是正交维度，PrdRole 决定
 * 谁在问/技术深度，PrdReqType 决定问题重点和产出物结构）：
 * - BUG_FIX：缺陷修复，问复现步骤/期望-实际行为/影响范围，产出「缺陷修复说明」而非标准 PRD
 * - MODULE_ADJUST：调整现有模块，问现状/目标/兼容性，产出标准 PRD
 * - NEW_MODULE：新增模块/功能，问业务目标/场景/边界，产出标准 PRD（默认值，兼容历史数据）
 */
export type PrdReqType = 'BUG_FIX' | 'MODULE_ADJUST' | 'NEW_MODULE'

/**
 * 澄清模式：progressive（渐进式，一题一题问，Claude 根据上一题答案动态追问，默认）|
 * batch（批量，一次性生成 maxQuestions 道题，用户一次性填完再统一提交）。
 * 在「开始澄清前确认」弹框里选，恢复未完成会话时沿用创建时选的模式，不会中途切换。
 */
export type PrdClarifyMode = 'progressive' | 'batch'
export type AgentEngine = 'claude' | 'codex'

export interface QuestionItem {
  id: number
  question: string
  answer: string
}

/**
 * 批量澄清「一次性回答」的自动分配结果（后端 PrdClarifyService.AnswerDistribution）。
 */
export interface AnswerDistribution {
  /** 与题目等长、按题序对齐的答案数组；没匹配到内容的位置是空串 */
  answers: string[]
  /** 实际分配到内容的题数 */
  matchedCount: number
  /** 没分到内容的题号（1 起），提示用户手动补充 */
  unmatchedNumbers: number[]
  /** 没能归到任何一题的剩余内容（可能是额外补充说明，也可能是模型漏分） */
  leftover: string
}

/**
 * 开发文档生成历史的一条记录（追溯"这版为什么长这样"）。
 * mode: generate（首次生成）| regenerate（基于最新 PRD 从零重新生成）|
 *       update（基于当前开发文档增量更新，extraInstructions 含完整澄清问答文本）
 */
export interface DevDocHistoryEntry {
  version: number
  mode: 'generate' | 'regenerate' | 'update'
  extraInstructions: string
  generatedAt: number
}

/**
 * 开发文档某个版本的摘要（GET /dev-doc/versions 返回），以磁盘上实际存在的版本为准，
 * 不依赖 devDocHistory JSON——mode 为 null 表示该版本早于「生成记录」功能上线，
 * 磁盘上有备份文件但没有对应记录，仍可查看内容，只是没有补充说明可看。
 *
 * qaHistory 是这一版 TDD 专属的技术澄清问答记录，跟 PRD 首次业务澄清记录
 * （PrdSessionView.questions）是两份完全独立的数据，不会共用/混显。
 */
export interface DevDocVersionSummary {
  version: number
  isCurrent: boolean
  mode: 'generate' | 'regenerate' | 'update' | null
  extraInstructions: string | null
  generatedAt: number | null
  qaHistory: { question: string; answer: string }[]
}

/**
 * 进度评估某个版本的摘要（GET /progress/versions 返回），以磁盘上实际存在的版本为准，
 * 用法完全对齐 DevDocVersionSummary——按版本追加落盘，不覆盖，历史评估快照可回看。
 */
export interface ProgressVersionSummary {
  version: number
  isCurrent: boolean
  extraContext: string | null
  generatedAt: number | null
}

export type EstimationConfidence = 'LOW' | 'MEDIUM' | 'HIGH'

export interface EstimationBreakdownItem {
  item: string
  hours: number
}

/**
 * AI 工时评估结果（对应「当前」这份开发文档——开发文档一定基于最新 PRD 生成，所以评估
 * 天然只需要挂在会话上，不用像 devDocHistory 那样按版本存多份）。
 *
 * stale=true 表示开发文档在这次评估之后又重新生成/更新过，工时可能已经不准，建议重新评估。
 */
export interface DevDocEstimation {
  hoursMin: number
  hoursMax: number
  confidence: EstimationConfidence
  reasoning: string
  breakdown: EstimationBreakdownItem[]
  inspectedFiles: string[]
  codeEvidenceSummary: string
  assumptions: string[]
  risks: string[]
  engine: AgentEngine | ''
  projectPath: string
  codeInspected: boolean
  sourceSessionId: string
  sourceTitle: string
  workStatus: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR'
  workError: string
  startedAt: number
  completedAt: number | null
  estimatedAt: number
  stale: boolean
  staleReasons: string[]
}

export interface PrdSessionView {
  id: string
  title: string
  project: string | null
  module: string | null
  status: PrdSessionStatus
  /** 草稿阶段尚未选择执行引擎；真正开始澄清时才写入。 */
  engine: AgentEngine | null
  role: PrdRole
  /** 需求类型：决定澄清问题重点和生成文档结构，见 PrdReqType 注释 */
  reqType: PrdReqType
  /** 本次澄清最多问几轮（用户在「开始澄清」确认弹框里设置，按 reqType 预填默认值） */
  maxQuestions: number
  /** 澄清模式：progressive（渐进式逐题追问）| batch（批量一次性生成全部问题） */
  clarifyMode: PrdClarifyMode
  /** 原始需求描述（用于历史记录弹窗展示） */
  rawInput: string | null
  /** 业务来源结构化字段（飞书需求池导入或 PRD 起草时填写） */
  businessFields: PrdBusinessFields
  questions: QuestionItem[]
  /** 最近一次 PRD 澄清问题生成完成时间戳（毫秒） */
  prdQuestionsGeneratedAt: number | null
  /** 最近一次 PRD 文档生成完成时间戳（毫秒） */
  prdGeneratedAt: number | null
  mdPath: string | null
  /** 开发文档路径（非 null 表示已生成开发文档） */
  devDocPath: string | null
  /** 关联的 Vibe Coding 开发会话 ID（非 null 表示已启动 feature-dev 开发会话） */
  devSessionId: string | null
  /** 开发文档最后生成时间戳（毫秒）。null 或 < updatedAt 表示开发文档已过期 */
  devDocGeneratedAt: number | null
  /** 最近一次 TDD 澄清问题生成完成时间戳（毫秒） */
  devDocQuestionsGeneratedAt: number | null
  /** 开发文档生成历史（按发生顺序），每次生成/重新生成/更新都有一条记录 */
  devDocHistory: DevDocHistoryEntry[]
  /** 已提交但尚未成功生成 TDD 的技术澄清答案；失败重试时恢复到表单 */
  devDocQaDraft: Array<{ question: string; answer: string }>
  /** TDD 点按作业的持久状态，刷新页面后仍可恢复节点颜色。 */
  devDocWorkStatus: 'BUILDING_QUESTIONS' | 'AWAITING_ANSWERS' | 'GENERATING' | 'ERROR' | 'DONE' | null
  devDocWorkError: string | null
  /** AI 工时评估结果，尚未评估过时为 null */
  devDocEstimation: DevDocEstimation | null
  /** 进度评估文档路径（非 null 表示评估过至少一次） */
  progressPath: string | null
  /** 最后一次进度评估时间戳（毫秒），是否"已过期"由前端跟 devDocGeneratedAt/updatedAt 比较判断 */
  progressGeneratedAt: number | null
  /** 创建者 auth_user.id；未登录/鉴权关闭时创建、或早于该功能上线的存量数据可能为 null */
  createdByUserId: number | null
  /** 创建者用户名，仅历史列表接口会解析（批量查一次），其它单会话接口一律为 null */
  createdByUsername: string | null
  /** 父会话 id，非 null 表示这是需求拆分或修订产生的子 PRD，历史列表据此嵌套展示 */
  parentId: string | null
  errorMsg: string | null
  createdAt: number
  updatedAt: number
}

export interface PrdBusinessFields {
  requirementDetail?: string | null
  businessBackground?: string | null
  /** 业务侧原始分类，不等同于 reqType 的 AI 澄清策略分类 */
  businessRequirementType?: string | null
  requirementSoftware?: string | null
  initiatingDepartment?: string | null
  requester?: string | null
  /** ISO 日期文本 yyyy-MM-dd */
  requestedAt?: string | null
  attachments?: string | null
  followUpRecords?: string | null
}

export interface CreateSessionRequest {
  title: string
  rawInput: string
  project?: string
  module?: string
  model?: string
  engine?: AgentEngine
  role?: PrdRole
  reqType?: PrdReqType
  maxQuestions?: number
  clarifyMode?: PrdClarifyMode
  businessFields?: PrdBusinessFields
  /** 修订版/拆分子需求的来源会话；普通新建会话不传。 */
  parentId?: string
}

/** 保存/更新草稿：只含标题/需求描述/关联项目模块，草稿阶段还不用决定角色/需求类型/澄清深度/模式。 */
export interface SaveDraftRequest {
  title: string
  rawInput?: string
  project?: string
  module?: string
  businessFields?: PrdBusinessFields
}

/**
 * 需求拆分的一个子项：既是 POST /sessions/{id}/split 的响应元素（AI 建议），
 * 也是 POST /sessions/{id}/split/adopt 请求体里的元素（用户确认/编辑后采纳的子需求）。
 */
export interface SplitItem {
  title: string
  rawInput: string
  module?: string | null
}

/** AI 需求拆分预览结果：canSplit=false 时 items 为空，reason 说明为什么不建议拆。 */
export interface SplitPreview {
  canSplit: boolean
  reason: string | null
  items: SplitItem[]
}

export interface SubmitAnswersRequest {
  answers: string[]
}

export interface SaveContentRequest {
  content: string
}

/** 前端页面内部的步骤状态机 */
export type PrdStep =
  | 'INPUT'        // 填写需求表单
  | 'CHATTING'     // 多轮对话澄清（Claude 提问 + 用户回答，交替进行）
  | 'GENERATING'   // Claude 正在生成 PRD（SSE 流式）
  | 'EDITING'      // PRD 生成完毕，进入编辑器
