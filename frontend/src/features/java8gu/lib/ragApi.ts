import { http } from '@/lib/api'

/** 一条卡片召回命中（后端代码检索，真实卡片，非模型转述） */
export interface Java8guHit {
  id: string
  categoryLabel: string
  title: string
  score: number
  snippet: string
}

/** RAG 运行态 / 重建结果（透传后端 Java8guRagService） */
export interface Java8guRagStatus {
  enabled: boolean
  collection?: string
  points?: number
  usable?: boolean
  indexed?: number
  skipped?: number
  minScore?: number
  hint?: string
  error?: string
}

/** 自检：向量检索是否就绪（enabled / 集合点数 / usable） */
export function java8guRagStatus(): Promise<Java8guRagStatus> {
  return http<Java8guRagStatus>('/java8gu/rag/status')
}

/** 批量入库：读卡片全量重建向量索引（确定性 ETL） */
export function java8guReindex(): Promise<Java8guRagStatus> {
  return http<Java8guRagStatus>('/java8gu/rag/reindex', { method: 'POST' })
}
