import type { ChatItem } from '../types'
import { classifyTool } from './toolKinds'

const cliInvocation = /(?:^|[\\/])cross-engine-verification[\\/]scripts[\\/]review\.py(?:["']?\s+)run(?=\s|$)/i
const eventPrefix = 'forge.review.activity/v1 '
const states = ['REQUESTED', 'RUNNING', 'COMPLETED', 'SKIPPED', 'TIMEOUT', 'ERROR'] as const
type ReviewState = typeof states[number] | 'UNKNOWN'

export interface CrossEngineReview {
  state: ReviewState
  engine?: string
  model?: string
  reviewStatus?: 'PASS' | 'FAIL' | 'INCONCLUSIVE'
  reasonCode?: string
  durationMs?: number
  findingCount?: number
}

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function parse(value: string) {
  try { return object(JSON.parse(value)) } catch { return undefined }
}

function decode(record: Record<string, unknown>, legacy: boolean): CrossEngineReview | undefined {
  const state = legacy ? record.executionStatus : record.status
  if (!states.some(value => value === state)) return undefined
  if (legacy && (!('verificationEngine' in record) || !Array.isArray(record.findings))) return undefined
  const engine = legacy ? record.verificationEngine ?? record.requestedEngine : record.engine
  const model = legacy ? record.verificationModel : record.model
  const count = legacy && Array.isArray(record.findings) ? record.findings.length : record.findingCount
  return {
    state: state as ReviewState,
    engine: typeof engine === 'string' && /^[\w-]{1,32}$/.test(engine) ? engine : undefined,
    model: typeof model === 'string' && /^[\w./:@+-]{1,120}$/.test(model) ? model : undefined,
    reviewStatus: record.reviewStatus === 'PASS' || record.reviewStatus === 'FAIL' || record.reviewStatus === 'INCONCLUSIVE'
      ? record.reviewStatus : undefined,
    reasonCode: typeof record.reasonCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(record.reasonCode) ? record.reasonCode : undefined,
    durationMs: typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) && record.durationMs >= 0
      ? record.durationMs : undefined,
    findingCount: typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : undefined,
  }
}

function receipt(output: string, terminal: boolean): CrossEngineReview | undefined {
  const tail = output.slice(-24_000)
  for (const line of tail.split(/\r?\n/).reverse()) {
    if (!line.startsWith(eventPrefix) || line.length > 768) continue
    const record = parse(line.slice(eventPrefix.length))
    if (!record || typeof record.id !== 'string' || !/^[0-9a-f]{32}$/.test(record.id)) continue
    const event = decode(record, false)
    if (event && (!terminal || (event.state !== 'REQUESTED' && event.state !== 'RUNNING'))) return event
  }
  // Older CLI prints one JSON result. A shell wrapper may put timing or an "Output" label before it.
  if (!terminal) return undefined
  const start = tail.search(/\{\s*"primaryEngine"\s*:/)
  const record = start >= 0 && parse(tail.slice(start).trimEnd())
  return record ? decode(record, true) : undefined
}

export function crossEngineReview(item: ToolItem, running: boolean, outputTail = ''): CrossEngineReview | undefined {
  if (classifyTool(item.toolName).kind !== 'bash') return undefined
  const command = typeof item.input === 'string' ? item.input : object(item.input)?.command ?? object(item.input)?.cmd
  if (typeof command !== 'string' || !cliInvocation.test(command)) return undefined
  if (item.output !== undefined) {
    return receipt(item.output, true) ?? { state: item.isError ? 'ERROR' : 'UNKNOWN' }
  }
  const event = receipt(outputTail, false)
  return running ? event ?? { state: 'REQUESTED' } : { ...event, state: 'UNKNOWN' }
}

export function reviewToolId(activityId: string) {
  return activityId.startsWith('tool-activity-') ? 'tool-' + activityId.slice('tool-activity-'.length) : ''
}

export function crossEngineReviewRows(items: ChatItem[], running: boolean) {
  const outputTails = new Map<string, string>()
  for (const item of items) {
    if (item.kind !== 'activity' || item.activityType !== 'tool') continue
    const output = object(item.data)?.output
    if (typeof output === 'string') outputTails.set(reviewToolId(item.id), output)
  }
  const rows = new Map<string, CrossEngineReview>()
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item.kind === 'result' || item.kind === 'user') running = false
    if (item.kind !== 'tool') continue
    const review = crossEngineReview(item, running, outputTails.get(item.id))
    if (review) rows.set(item.id, review)
  }
  return rows
}
