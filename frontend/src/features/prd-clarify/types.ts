/** PRD 澄清工具的 TypeScript 类型定义 */

export type PrdSessionStatus = 'CLARIFYING' | 'GENERATING' | 'DONE' | 'ERROR'

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
  questions: QuestionItem[]
  mdPath: string | null
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
  | 'CLARIFYING'   // Claude 正在生成澄清问题（SSE 流式）
  | 'ANSWERING'    // 用户填写澄清问题的答案
  | 'GENERATING'   // Claude 正在生成 PRD（SSE 流式）
  | 'EDITING'      // PRD 生成完毕，进入编辑器
