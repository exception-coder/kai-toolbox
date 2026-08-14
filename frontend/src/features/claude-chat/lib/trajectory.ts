import type { ChatItem } from '../types'

export type TrajectoryLane = 'input' | 'model' | 'tools'

export interface TrajectoryRecord {
  id: string
  domId: string
  item: ChatItem
  lane: TrajectoryLane | null
  label: string
  preview: string
  detail: string
  ts: number | null
  durationMs: number | null
  isError: boolean
  searchableText: string
}

export interface TrajectoryTurn {
  id: string
  number: number | null
  records: TrajectoryRecord[]
  startedAt: number | null
  endedAt: number | null
  durationMs: number | null
  steps: number
  calls: number
  searchableText: string
}

export interface TrajectoryTimelineSpan {
  record: TrajectoryRecord
  leftPercent: number
  widthPercent: number
  equalWidth: boolean
}

export interface TrajectoryTimeline {
  spans: TrajectoryTimelineSpan[]
  turnBoundaries: number[]
}

const MIN_DURATION_WEIGHT_MS = 25

/**
 * 把消息流投影成「轮次 + Assistant 步骤 + Tool 调用」轨迹。
 * 历史分页可能从一轮中间截断，因此首个 user 之前的记录保留为无编号片段，避免误标成 Turn 1。
 */
export function deriveTrajectory(items: ChatItem[]): TrajectoryTurn[] {
  const buckets: Array<{ id: string; number: number | null; items: ChatItem[] }> = []
  let current: { id: string; number: number | null; items: ChatItem[] } | null = null
  let turnNumber = 0

  for (const item of items) {
    if (item.kind === 'user') {
      const hasNonUser = current?.items.some(existing => existing.kind !== 'user') ?? false
      if (!current || hasNonUser) {
        turnNumber += 1
        current = { id: `turn-${item.id}`, number: turnNumber, items: [] }
        buckets.push(current)
      }
    } else if (!current) {
      current = { id: `fragment-${item.id}`, number: null, items: [] }
      buckets.push(current)
    }
    current?.items.push(item)
  }

  return buckets.map((bucket) => finalizeTurn(bucket))
}

function finalizeTurn(bucket: { id: string; number: number | null; items: ChatItem[] }): TrajectoryTurn {
  const records = bucket.items.map((item, index) => toRecord(item, index))
  applyDerivedDurations(records)

  const timestamps = records.flatMap(record => record.ts == null ? [] : [record.ts])
  const startedAt = timestamps.length > 0 ? Math.min(...timestamps) : null
  const endedAt = timestamps.length > 0 ? Math.max(...timestamps) : null
  const resultLatency = [...bucket.items].reverse().find(
    (item): item is Extract<ChatItem, { kind: 'result' }> => item.kind === 'result' && item.latencyMs != null,
  )?.latencyMs
  const durationMs = resultLatency != null
    ? Math.max(0, resultLatency)
    : startedAt != null && endedAt != null ? Math.max(0, endedAt - startedAt) : null
  const searchableText = records.map(record => record.searchableText).join('\n').toLocaleLowerCase()

  return {
    id: bucket.id,
    number: bucket.number,
    records,
    startedAt,
    endedAt,
    durationMs,
    // 轨迹里的 Turns 对应可见 Assistant 步骤；Calls 对应 Tool 行，二者独立控制。
    steps: records.filter(record => record.item.kind === 'assistant').length,
    calls: records.filter(record => record.item.kind === 'tool').length,
    searchableText,
  }
}

function toRecord(item: ChatItem, index: number): TrajectoryRecord {
  const ts = typeof item.ts === 'number' && Number.isFinite(item.ts) ? item.ts : null
  let lane: TrajectoryLane | null = null
  let label = ''
  let preview = ''
  let detail = ''
  let isError = false
  let durationMs: number | null = null

  switch (item.kind) {
    case 'user':
      lane = 'input'
      label = 'USER'
      preview = item.displayText ?? item.text
      detail = preview
      break
    case 'assistant':
      lane = 'model'
      label = 'ASSISTANT'
      preview = item.text
      detail = item.text
      break
    case 'tool':
      lane = 'tools'
      label = 'TOOL'
      preview = item.toolName || 'Tool'
      detail = [safeStringify(item.input), item.output ?? ''].filter(Boolean).join('\n\n')
      isError = item.isError === true
      durationMs = finiteDuration(item.elapsedMs)
      break
    case 'activity': {
      const data = asRecord(item.data)
      const toolActivity = item.activityType === 'tool' || item.activityType === 'command'
        || item.activityType === 'file' || item.activityType === 'diff'
      lane = toolActivity ? 'tools' : 'model'
      label = toolActivity ? 'TOOL' : 'STATUS'
      preview = [item.title, item.detail].filter(Boolean).join(' · ')
      detail = [item.detail ?? '', safeStringify(item.data)].filter(Boolean).join('\n\n')
      isError = item.outcome === 'error' || item.severity === 'error'
      durationMs = finiteDuration(data?.elapsedMs)
      break
    }
    case 'result':
      label = 'RESULT'
      preview = item.stopReason
      detail = safeStringify(item.usage)
      isError = item.stopReason === 'error'
      durationMs = finiteDuration(item.latencyMs)
      break
    case 'warning':
      label = 'WARNING'
      preview = item.message
      detail = `${item.code}\n${item.message}`
      break
    case 'error':
      label = 'ERROR'
      preview = item.message
      detail = `${item.code}\n${item.message}`
      isError = true
      break
  }

  return {
    id: item.id,
    domId: `trajectory-record-${index}-${safeDomToken(item.id)}`,
    item,
    lane,
    label,
    preview: preview.trim(),
    detail: detail.trim(),
    ts,
    durationMs,
    isError,
    searchableText: `${label}\n${preview}\n${detail}`.toLocaleLowerCase(),
  }
}

/** 为 transcript 未记录独立耗时的模型/工具项，用相邻时间戳补出可用的可视化时长。 */
function applyDerivedDurations(records: TrajectoryRecord[]) {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.durationMs != null || record.ts == null || record.lane === 'input' || record.item.kind === 'result') continue
    const previousTs = [...records.slice(0, index)].reverse()
      .find(candidate => candidate.ts != null && candidate.ts < record.ts!)?.ts
    const nextTs = records.slice(index + 1).find(candidate => candidate.ts != null && candidate.ts > record.ts!)?.ts
    if (record.item.kind === 'assistant') {
      const before = previousTs == null ? 0 : record.ts - previousTs
      const after = nextTs == null ? 0 : nextTs - record.ts
      if (before > 0 || after > 0) record.durationMs = Math.max(before, after)
    } else if (nextTs != null) {
      record.durationMs = Math.max(0, nextTs - record.ts)
    }
  }
}

/**
 * 三泳道顶部概览：等宽模式按事件均分；Duration 模式按事件实际/推导耗时分配宽度，
 * 只累计活动耗时，不把用户两轮之间的空闲时间算入，避免一晚没操作把轨迹压成一条线。
 */
export function deriveTrajectoryTimeline(turns: TrajectoryTurn[], actualDuration: boolean): TrajectoryTimeline {
  const timelineRecords = turns.flatMap(turn => turn.records.filter(record => record.lane != null
    && !(record.item.kind === 'activity' && record.item.status === 'completed'
      && (record.item.activityType === 'tool' || record.item.activityType === 'turn'))))
  if (timelineRecords.length === 0) return { spans: [], turnBoundaries: [] }

  const firstRecordIds = new Set(turns.flatMap(turn => {
    const record = turn.records.find(candidate => candidate.lane != null)
    return record ? [record.id] : []
  }))
  if (!actualDuration) {
    const spans = timelineRecords.map((record, index) => ({
      record,
      leftPercent: (index + 0.5) / timelineRecords.length * 100,
      widthPercent: 0,
      equalWidth: true,
    }))
    const turnBoundaries = timelineRecords
      .flatMap((record, index) => firstRecordIds.has(record.id) && index > 0
        ? [index / timelineRecords.length * 100]
        : [])
    return { spans, turnBoundaries }
  }

  const weights = timelineRecords.map(record => actualDuration
    ? Math.max(MIN_DURATION_WEIGHT_MS, record.durationMs ?? 0)
    : 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let offset = 0
  const spans = timelineRecords.map((record, index) => {
    const weight = weights[index]
    const leftPercent = total > 0 ? offset / total * 100 : 0
    const widthPercent = total > 0 ? weight / total * 100 : 100 / timelineRecords.length
    offset += weight
    return { record, leftPercent, widthPercent, equalWidth: false }
  })
  const turnBoundaries = spans
    .filter(span => firstRecordIds.has(span.record.id))
    .slice(1)
    .map(span => span.leftPercent)
  return { spans, turnBoundaries }
}

export function matchesTrajectoryQuery(record: TrajectoryRecord, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  return normalized === '' || record.searchableText.includes(normalized)
}

export function formatTrajectoryDuration(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs)) return '—'
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`
  if (durationMs < 60_000) return `${trimFixed(durationMs / 1_000, 1)} s`
  if (durationMs < 3_600_000) {
    const minutes = Math.floor(durationMs / 60_000)
    const seconds = Math.round((durationMs % 60_000) / 1_000)
    return `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(durationMs / 3_600_000)
  const minutes = Math.round((durationMs % 3_600_000) / 60_000)
  return `${hours}h ${minutes}m`
}

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$/, '')
}

function finiteDuration(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function safeStringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function safeDomToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(-80)
}
