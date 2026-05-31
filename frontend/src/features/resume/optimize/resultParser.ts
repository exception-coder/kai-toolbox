// 流式响应的兜底解析：服务端把整段 JSON 作为 LLM 文本流式返回，
// 前端在流结束后做一次性 JSON 解析，提取 optimizedContent / changeNotes / highlightedSkills。
import type { OptimizationResult } from './types'

export function parseStreamedResult(raw: string): OptimizationResult {
  const trimmed = stripFence(raw.trim())
  try {
    const parsed = JSON.parse(trimmed) as Partial<OptimizationResult> & {
      optimizedContent?: unknown
      // v1.0 旧字段名，兼容期保留容错
      matchedKeywords?: unknown
    }
    const skills = pickStringArray(parsed.highlightedSkills) ?? pickStringArray(parsed.matchedKeywords) ?? []
    return {
      optimizedContent: normalizeOptimizedContent(parsed.optimizedContent),
      changeNotes: pickStringArray(parsed.changeNotes) ?? [],
      highlightedSkills: skills,
    }
  } catch (e) {
    console.warn('[resume.optimize] parse stream result failed, return raw', e)
    return {
      optimizedContent: trimmed,
      changeNotes: ['LLM 返回的不是合法 JSON，已展示原始输出'],
      highlightedSkills: [],
    }
  }
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter(s => typeof s === 'string')
}

function stripFence(s: string): string {
  let r = s
  if (r.startsWith('```json')) r = r.slice(7)
  else if (r.startsWith('```')) r = r.slice(3)
  if (r.endsWith('```')) r = r.slice(0, -3)
  return r.trim()
}

function normalizeOptimizedContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (value != null && typeof value === 'object') return JSON.stringify(value)
  return ''
}
