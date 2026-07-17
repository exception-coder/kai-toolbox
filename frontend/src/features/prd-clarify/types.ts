/** PRD 澄清工具的 TypeScript 类型定义 */

export type PrdSessionStatus = 'CLARIFYING' | 'GENERATING' | 'DONE' | 'ERROR'

/** 提需求方角色，决定 Claude 澄清问题的深度和语言风格 */
export type PrdRole = 'PRODUCT' | 'BUSINESS'

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
