// 简历优化 API 客户端：薄薄一层，把 backend SSE 流式响应聚合成一个 string，
// 让 UI 层只关心「输出文本不断增长」的简单语义。
import { http, subscribeSsePost } from '@/lib/api'
import type { OptimizationResult, SectionType, SeniorityLevel } from './types'

export interface OptimizeRequest {
  sectionType: SectionType
  originalContent: string
  /** 目标岗位名称（来自简历 basics.jobIntent） */
  targetRole: string
  /** 工作年限（整数年），可选；由 basics.experienceYears 解析 */
  experienceYears?: number
  /** 岗位级别，由前端基于年限自动推断后传入；后端 prompt 据此分档写作语气 */
  seniorityLevel?: SeniorityLevel
  otherSectionsBrief?: string
  model?: string
}

/** 同步优化：等待完整结果 */
export function optimize(req: OptimizeRequest): Promise<OptimizationResult> {
  return http<OptimizationResult>('/v1/resume/optimize', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export interface StreamHandlers {
  /** 每收到一段新内容（已是累加后的完整文本）触发 */
  onProgress: (accumulated: string) => void
  /** 流结束时触发，传入完整文本，由调用方做 JSON 解析 */
  onDone: (accumulated: string) => void
  /** 错误回调 */
  onError: (err: Error) => void
}

/**
 * 流式优化：返回 abort 函数。
 *
 * 后端通过 SSE 推送 `chunk` 事件（payload: {content: "..."})与 `done` 事件。
 * 这里做累加聚合，让上层只关心「当前累计的字符串」。
 */
export function optimizeStream(req: OptimizeRequest, handlers: StreamHandlers): () => void {
  let accumulated = ''
  const abort = subscribeSsePost('/v1/resume/optimize/stream', req, {
    onEvent: (eventName, data) => {
      if (eventName === 'chunk' && data && typeof data === 'object' && 'content' in data) {
        const chunk = String((data as { content: unknown }).content ?? '')
        if (chunk) {
          accumulated += chunk
          handlers.onProgress(accumulated)
        }
      } else if (eventName === 'done') {
        handlers.onDone(accumulated)
      }
    },
    onError: err => {
      handlers.onError(err instanceof Error ? err : new Error(String(err)))
    },
  })
  return abort
}
