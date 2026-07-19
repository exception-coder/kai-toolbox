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

export interface QuestionItem {
  id: number
  question: string
  answer: string
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
