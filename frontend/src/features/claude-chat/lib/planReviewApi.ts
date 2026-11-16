import { http } from '@/lib/api'
import type { Engine } from '../types'

export const REVIEW_ENGINES: Engine[] = ['claude', 'codex', 'pi', 'copilot']
export interface PlanReviewTask {
  engine: Engine; attemptId: string; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED'
  result: string | null; error: string | null; model: string | null
}
export interface PlanReview {
  id: string; sessionId: string; sourceMessageId: string; material: string; focus: string; createdAt: number; tasks: PlanReviewTask[]
}
export interface PlanReviewSummary { id: string; sourceMessageId: string; createdAt: number; preview: string; activeCount: number; total: number }
export interface PlanReviewInput { requestId: string; sourceMessageId: string; material: string; focus: string; engines: Engine[] }
const base = (id: string) => `/claude-chat/sessions/${encodeURIComponent(id)}/plan-reviews`
export const listPlanReviews = (id: string, signal?: AbortSignal) => http<PlanReviewSummary[]>(base(id), { signal })
export const getPlanReview = (id: string, review: string, signal?: AbortSignal) => http<PlanReview>(`${base(id)}/${encodeURIComponent(review)}`, { signal })
export const createPlanReview = (id: string, input: PlanReviewInput) => http<PlanReview>(base(id), { method: 'POST', body: JSON.stringify(input) })
export const changePlanReview = (id: string, review: string, engine: Engine, action: 'cancel' | 'retry', requestId?: string) =>
  http<PlanReview>(`${base(id)}/${encodeURIComponent(review)}/${engine}/${action}`, { method: 'POST', body: JSON.stringify({ requestId }) })

export function reviewUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Only persist a fingerprint and request identity, never the quoted material or credentials. */
export function planReviewRequestId(sessionId: string, input: Omit<PlanReviewInput, 'requestId'>): string {
  const raw = JSON.stringify({ ...input, engines: [...input.engines].sort() })
  let hash = 2166136261
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619)
  const signature = `${raw.length}:${hash >>> 0}`
  const key = `forge:plan-review-request:${sessionId}`
  // Storage failure is surfaced before dispatch; silently minting a new identity could duplicate a paid call.
  const stored = localStorage.getItem(key)
  if (stored) {
    const previous = JSON.parse(stored) as { signature: string; id: string }
    if (previous.signature === signature) return previous.id
  }
  const id = reviewUuid()
  localStorage.setItem(key, JSON.stringify({ signature, id }))
  return id
}

export function reviewQuote(review: PlanReview, task: PlanReviewTask): string {
  return `请评估以下独立评审建议，并说明采纳或不采纳的理由，再按我的要求完善方案。评审意见尚未经项目验证。\n`
    + `评审批次：${review.id}；来源消息：${review.sourceMessageId || '手动引用'}；引擎：${task.engine}；模型：${task.model || '原生默认（未报告具体型号）'}\n\n`
    + `本次评审的引用材料：\n${review.material}\n\n关注点：${review.focus || '通用方案评审'}\n\n评审建议：\n${task.result}`
}
