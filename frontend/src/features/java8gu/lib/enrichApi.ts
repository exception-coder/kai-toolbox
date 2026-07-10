// Block 3 前端接线：请求后端知识补全（cache-first），把结果整理成可 mergeEnrichment 的形状。
//
// 补全是"锦上添花"：任何失败都吞掉、返回空补全，让页面继续渲染 markdown 原生内容。

import { http } from '@/lib/api'
import type { KnowledgeDiagram, KnowledgeQA } from './knowledge'

/** 后端 /api/java8gu/enrich 的原始返回 */
interface EnrichResponse {
  id: string
  hash: string
  cached: boolean
  diagram?: string
  qa?: { q: string; a: string }[]
  pitfalls?: string[]
  explanation?: string
  error?: string
}

/** 整理后可直接喂给 mergeEnrichment 的补全结果 */
export interface Enrichment {
  diagrams: KnowledgeDiagram[]
  qa: KnowledgeQA[]
  pitfalls: string[]
  explanation?: string
  cached: boolean
  error?: string
}

const EMPTY: Enrichment = { diagrams: [], qa: [], pitfalls: [], cached: false }

/**
 * 请求一道题的 AI 补全。失败一律降级为空补全（不抛错）。
 * @param id 题号
 * @param markdown 题目 markdown 原文（后端据此算缓存 hash + 加工）
 */
export async function fetchEnrichment(id: string, markdown: string): Promise<Enrichment> {
  try {
    const res = await http<EnrichResponse>('/java8gu/enrich', {
      method: 'POST',
      body: JSON.stringify({ id, markdown }),
    })
    const diagram = (res.diagram ?? '').trim()
    return {
      diagrams: diagram ? [{ kind: 'mermaid', code: diagram, source: 'ai' }] : [],
      qa: (res.qa ?? []).filter(x => x && x.q && x.a),
      pitfalls: (res.pitfalls ?? []).filter(Boolean),
      explanation: (res.explanation ?? '').trim() || undefined,
      cached: !!res.cached,
      error: res.error,
    }
  } catch (e) {
    return { ...EMPTY, error: e instanceof Error ? e.message : String(e) }
  }
}
