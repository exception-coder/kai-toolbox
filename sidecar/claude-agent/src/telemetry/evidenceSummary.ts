import { createHash } from 'node:crypto'
import { sanitizeText } from './sanitizer.js'

export type EvidenceSourceType =
  | 'domain_knowledge'
  | 'graph'
  | 'source_code'
  | 'database'
  | 'api'
  | 'document'
  | 'unknown'

export interface ToolEvidenceSummary {
  schemaVersion: 1
  sourceType: EvidenceSourceType
  system?: string
  modules?: string[]
  operation?: string
  queryFingerprint?: string
  resultCount?: number
  evidenceIds?: string[]
  evidenceLevel?: 'L1' | 'L2' | 'L3' | 'L4' | 'UNKNOWN'
  truncated?: boolean
}

const MAX_IDS = Math.max(1, Number(process.env.TOOLBOX_OBSERVABILITY_EVIDENCE_MAX_IDS) || 20)
const LEVELS = new Set(['L1', 'L2', 'L3', 'L4', 'UNKNOWN'])

/**
 * Build a bounded evidence projection from the real tool event. This function never
 * stores raw SQL, parameters, source contents, or local absolute paths.
 */
export function summarizeToolEvidence(
  toolName: unknown,
  input: unknown,
  output: unknown,
  declared?: unknown,
): ToolEvidenceSummary {
  const name = String(toolName ?? '').toLowerCase()
  const args = asRecord(input)
  const explicit = normalizeDeclared(declared)
  const sourceType = explicit?.sourceType ?? inferSourceType(name)
  const system = safeSystem(explicit?.system ?? inferSystem(name, args))
  const modules = explicit?.modules ?? stringList(args.modules ?? args.module)
  const operation = explicit?.operation ?? inferOperation(name, sourceType, args)
  const query = firstString(args.query, args.sql, args.pattern, args.keyword, args.question, args.path, args.filePath, args.url)
  const queryFingerprint = normalizeFingerprint(explicit?.queryFingerprint)
    ?? (query ? fingerprint(normalizeQuery(query)) : undefined)
  const result = resultMetadata(output)
  const evidenceIds = explicit?.evidenceIds ?? result.evidenceIds
    ?? (sourceType === 'source_code' ? stringList(args.path ?? args.filePath)?.map(sanitizeEvidenceId) : undefined)
  const truncated = Boolean(explicit?.truncated || result.truncated)

  return compact({
    schemaVersion: 1 as const,
    sourceType,
    system,
    modules,
    operation,
    queryFingerprint,
    resultCount: explicit?.resultCount ?? result.resultCount,
    evidenceIds,
    evidenceLevel: explicit?.evidenceLevel ?? result.evidenceLevel,
    truncated: truncated || undefined,
  })
}

export function evidenceAttributes(summary: ToolEvidenceSummary): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {
    'evidence.schema_version': summary.schemaVersion,
    'evidence.source_type': summary.sourceType,
  }
  if (summary.system) attributes['evidence.system'] = sanitizeText(summary.system)
  if (summary.modules?.length) attributes['evidence.modules'] = summary.modules.map(sanitizeText).join(',')
  if (summary.operation) attributes['evidence.operation'] = sanitizeText(summary.operation)
  if (summary.queryFingerprint) attributes['evidence.query_fingerprint'] = summary.queryFingerprint
  if (summary.resultCount != null) attributes['evidence.result_count'] = summary.resultCount
  if (summary.evidenceIds?.length) attributes['evidence.ids'] = summary.evidenceIds.map(sanitizeEvidenceId).join(',')
  if (summary.evidenceLevel) attributes['evidence.level'] = summary.evidenceLevel
  if (summary.truncated != null) attributes['evidence.truncated'] = summary.truncated
  return attributes
}

function inferSourceType(name: string): EvidenceSourceType {
  if (name.includes('domain-knowledge') || name.includes('domain_knowledge')) return 'domain_knowledge'
  if (name.includes('graphify') || name.includes('source_context')) return 'graph'
  if (name.includes('source_read') || name.includes('source_search') || name.includes('read_file')) return 'source_code'
  if (name.includes('db_query') || name.includes('schema_search') || name.includes('validate_sql')) return 'database'
  if (name.includes('web_search') || name.includes('api')) return 'api'
  if (name.includes('document') || name.includes('pdf')) return 'document'
  return 'unknown'
}

function inferSystem(name: string, args: Record<string, unknown>): string | undefined {
  const explicit = firstString(args.system, args.systemName, args.project)
  if (explicit) return sanitizeText(explicit)
  for (const system of ['erp', 'srm', 'scm']) {
    if (name.includes(`${system}_`) || name.includes(`__${system}`)) return system
  }
  return undefined
}

function inferOperation(name: string, sourceType: EvidenceSourceType, args: Record<string, unknown>): string | undefined {
  if (sourceType === 'database') {
    if (name.includes('schema') || name.includes('metadata')) return 'metadata'
    return 'select'
  }
  if (sourceType === 'graph') {
    if (name.includes('path')) return 'path'
    if (name.includes('explain')) return 'explain'
    return 'query'
  }
  if (sourceType === 'source_code') return name.includes('search') ? 'search' : 'read'
  if (sourceType === 'domain_knowledge') {
    const operation = name.split('__').at(-1)
    return operation ? sanitizeText(operation) : 'search'
  }
  return firstString(args.operation)
}

function resultMetadata(output: unknown): Partial<ToolEvidenceSummary> {
  const parsed = parseOutput(output)
  if (Array.isArray(parsed)) return { resultCount: parsed.length }
  const record = asRecord(parsed)
  if (!Object.keys(record).length) return {}
  const rows = arrayValue(record.rows, record.results, record.items, record.matches, record.nodes, record.data)
  const count = finiteNumber(record.resultCount, record.count, record.total) ?? rows?.length
  const ids = collectIds(rows ?? parsed)
  const rawLevel = firstString(record.evidenceLevel, record.level)?.toUpperCase()
  const evidenceLevel = rawLevel && LEVELS.has(rawLevel)
    ? rawLevel as ToolEvidenceSummary['evidenceLevel']
    : undefined
  return {
    resultCount: count == null ? undefined : Math.max(0, Math.floor(count)),
    evidenceIds: ids.values,
    evidenceLevel,
    truncated: ids.truncated || record.truncated === true || undefined,
  }
}

function normalizeDeclared(value: unknown): ToolEvidenceSummary | undefined {
  const raw = asRecord(value)
  if (!Object.keys(raw).length) return undefined
  const sourceType = firstString(raw.sourceType, raw.source_type)
  const allowed: EvidenceSourceType[] = ['domain_knowledge', 'graph', 'source_code', 'database', 'api', 'document', 'unknown']
  const level = firstString(raw.evidenceLevel, raw.evidence_level)?.toUpperCase()
  return compact({
    schemaVersion: 1 as const,
    sourceType: allowed.includes(sourceType as EvidenceSourceType) ? sourceType as EvidenceSourceType : 'unknown',
    system: firstString(raw.system),
    modules: stringList(raw.modules),
    operation: firstString(raw.operation),
    queryFingerprint: firstString(raw.queryFingerprint, raw.query_fingerprint),
    resultCount: finiteNumber(raw.resultCount, raw.result_count),
    evidenceIds: stringList(raw.evidenceIds ?? raw.evidence_ids)?.slice(0, MAX_IDS).map(sanitizeEvidenceId),
    evidenceLevel: level && LEVELS.has(level) ? level as ToolEvidenceSummary['evidenceLevel'] : undefined,
    truncated: raw.truncated === true || undefined,
  })
}

function collectIds(value: unknown): { values?: string[], truncated: boolean } {
  const candidates = Array.isArray(value) ? value : [value]
  const found: string[] = []
  for (const item of candidates) {
    const record = asRecord(item)
    const id = firstString(record.evidenceId, record.nodeId, record.chunkId, record.documentId, record.id)
    if (id) found.push(sanitizeEvidenceId(id))
  }
  const unique = [...new Set(found)]
  return { values: unique.slice(0, MAX_IDS).length ? unique.slice(0, MAX_IDS) : undefined, truncated: unique.length > MAX_IDS }
}

function sanitizeEvidenceId(value: string): string {
  if (looksAbsolutePath(value)) return `path:${fingerprint(value.replaceAll('\\', '/').toLowerCase())}`
  return sanitizeText(value)
}

function safeSystem(value: string | undefined): string | undefined {
  if (!value) return undefined
  return looksAbsolutePath(value) ? `project:${fingerprint(value.replaceAll('\\', '/').toLowerCase())}` : sanitizeText(value)
}

function normalizeFingerprint(value: string | undefined): string | undefined {
  if (!value) return undefined
  return /^sha256:[a-f0-9]{16,64}$/i.test(value) ? value.toLowerCase() : fingerprint(value)
}

function looksAbsolutePath(value: string): boolean {
  return /^[a-z]:[\\/]/i.test(value) || value.startsWith('/') || value.startsWith('\\\\')
}

function normalizeQuery(value: string): string {
  return value
    .replace(/'(?:''|[^'])*'/g, '?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function fingerprint(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 24)}`
}

function parseOutput(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value
  try { return JSON.parse(trimmed) } catch { return value }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function arrayValue(...values: unknown[]): unknown[] | undefined {
  return values.find(Array.isArray) as unknown[] | undefined
}

function stringList(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const normalized = values.filter((item): item is string => typeof item === 'string')
    .map(item => sanitizeText(item).trim()).filter(Boolean)
  return normalized.length ? [...new Set(normalized)].slice(0, MAX_IDS) : undefined
}

function firstString(...values: unknown[]): string | undefined {
  const value = values.find(item => typeof item === 'string' && item.trim())
  return typeof value === 'string' ? sanitizeText(value.trim()) : undefined
}

function finiteNumber(...values: unknown[]): number | undefined {
  const value = values.find(item => typeof item === 'number' && Number.isFinite(item))
  return typeof value === 'number' ? value : undefined
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
