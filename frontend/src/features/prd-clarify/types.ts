/** PRD 澄清工具的 TypeScript 类型定义 */

export type PrdSessionStatus = 'CLARIFYING' | 'GENERATING' | 'DONE' | 'ERROR'

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

export interface QuestionItem {
  id: number
  question: string
  answer: string
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
 * qaHistory 是这一版专属的澄清问答记录（update 模式下才可能非空），跟 PRD 首次澄清记录
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
  estimatedAt: number
  stale: boolean
}

export interface PrdSessionView {
  id: string
  title: string
  project: string | null
  module: string | null
  status: PrdSessionStatus
  role: PrdRole
  /** 需求类型：决定澄清问题重点和生成文档结构，见 PrdReqType 注释 */
  reqType: PrdReqType
  /** 本次澄清最多问几轮（用户在「开始澄清」确认弹框里设置，按 reqType 预填默认值） */
  maxQuestions: number
  /** 澄清模式：progressive（渐进式逐题追问）| batch（批量一次性生成全部问题） */
  clarifyMode: PrdClarifyMode
  /** 原始需求描述（用于历史记录弹窗展示） */
  rawInput: string | null
  questions: QuestionItem[]
  mdPath: string | null
  /** 开发文档路径（非 null 表示已生成开发文档） */
  devDocPath: string | null
  /** 关联的 Vibe Coding 开发会话 ID（非 null 表示已启动 feature-dev 开发会话） */
  devSessionId: string | null
  /** 开发文档最后生成时间戳（毫秒）。null 或 < updatedAt 表示开发文档已过期 */
  devDocGeneratedAt: number | null
  /** 开发文档生成历史（按发生顺序），每次生成/重新生成/更新都有一条记录 */
  devDocHistory: DevDocHistoryEntry[]
  /** AI 工时评估结果，尚未评估过时为 null */
  devDocEstimation: DevDocEstimation | null
  /** 创建者 auth_user.id；未登录/鉴权关闭时创建、或早于该功能上线的存量数据可能为 null */
  createdByUserId: number | null
  /** 创建者用户名，仅历史列表接口会解析（批量查一次），其它单会话接口一律为 null */
  createdByUsername: string | null
  errorMsg: string | null
  createdAt: number
  updatedAt: number
}

export interface CreateSessionRequest {
  title: string
  rawInput: string
  project?: string
  module?: string
  model?: string
  role?: PrdRole
  reqType?: PrdReqType
  maxQuestions?: number
  clarifyMode?: PrdClarifyMode
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
