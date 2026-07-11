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
  miss?: boolean
  stale?: boolean
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
  /** 只读缓存时：该题从未补全过（此时前端展示手动按钮） */
  miss: boolean
  /** 命中的是旧内容的补全（原文已更新，建议重新补全） */
  stale: boolean
  error?: string
}

const EMPTY: Enrichment = {
  diagrams: [],
  qa: [],
  pitfalls: [],
  cached: false,
  miss: true,
  stale: false,
}

function toEnrichment(res: EnrichResponse): Enrichment {
  const diagram = (res.diagram ?? '').trim()
  return {
    diagrams: diagram ? [{ kind: 'mermaid', code: diagram, source: 'ai' }] : [],
    qa: (res.qa ?? []).filter(x => x && x.q && x.a),
    pitfalls: (res.pitfalls ?? []).filter(Boolean),
    explanation: (res.explanation ?? '').trim() || undefined,
    cached: !!res.cached,
    miss: !!res.miss,
    stale: !!res.stale,
    error: res.error,
  }
}

async function call(id: string, markdown: string, cacheOnly: boolean): Promise<Enrichment> {
  try {
    const res = await http<EnrichResponse>(
      `/java8gu/enrich${cacheOnly ? '?cacheOnly=true' : ''}`,
      { method: 'POST', body: JSON.stringify({ id, markdown }) },
    )
    return toEnrichment(res)
  } catch (e) {
    return { ...EMPTY, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 只读缓存：进题页自动调用，判断该题是否补全过。**绝不触发 LLM、无成本。**
 * miss=true 表示从未补全（前端展示手动按钮）；stale=true 表示命中旧内容的补全。
 */
export function peekEnrichment(id: string, markdown: string): Promise<Enrichment> {
  return call(id, markdown, true)
}

/**
 * 生成补全（cache-first）：命中缓存直接返回，miss 才调 LLM。失败降级空补全。
 */
export function fetchEnrichment(id: string, markdown: string): Promise<Enrichment> {
  return call(id, markdown, false)
}
