export type ConsultProblemCategory =
  | 'MENU_OPERATION'
  | 'BUSINESS_RULE'
  | 'PAGE_OR_API_ERROR'
  | 'DATA_ANOMALY'
  | 'SQL_OR_SCHEMA'
  | 'CROSS_SYSTEM'
  | 'OTHER'

export type ConsultRecognitionStatus = 'CONFIRMED' | 'PARTIAL' | 'UNRECOGNIZED'

export interface ConsultRecognition {
  moduleNames: string[]
  menuPaths: string[]
  problemCategory: ConsultProblemCategory | null
  recognitionStatus: ConsultRecognitionStatus
  evidence: string[]
}

const BLOCK_RE = /<<<CONSULT_RECOGNITION>>>\s*([\s\S]*?)\s*<<<END_CONSULT_RECOGNITION>>>/g
const INCOMPLETE_BLOCK_RE = /<<<CONSULT_RECOGNITION>>>[\s\S]*$/
const CATEGORIES = new Set<ConsultProblemCategory>([
  'MENU_OPERATION', 'BUSINESS_RULE', 'PAGE_OR_API_ERROR', 'DATA_ANOMALY',
  'SQL_OR_SCHEMA', 'CROSS_SYSTEM', 'OTHER',
])
const STATUSES = new Set<ConsultRecognitionStatus>(['CONFIRMED', 'PARTIAL', 'UNRECOGNIZED'])
const EVIDENCE = new Set([
  'USER_SELECTION', 'MODULE_CATALOG', 'MENU_KNOWLEDGE', 'CORE_SPEC',
  'GRAPHIFY', 'SOURCE_CODE', 'DDL', 'RUNTIME_DATA',
])

function normalizeList(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = item.trim().slice(0, 240)
    if (!normalized || allowed && !allowed.has(normalized) || result.includes(normalized)) continue
    result.push(normalized)
    if (result.length >= 12) break
  }
  return result
}

function parseBlock(json: string): ConsultRecognition | null {
  try {
    const value = JSON.parse(json) as Record<string, unknown>
    const category = typeof value.problemCategory === 'string' && CATEGORIES.has(value.problemCategory as ConsultProblemCategory)
      ? value.problemCategory as ConsultProblemCategory
      : null
    const status = typeof value.recognitionStatus === 'string' && STATUSES.has(value.recognitionStatus as ConsultRecognitionStatus)
      ? value.recognitionStatus as ConsultRecognitionStatus
      : 'UNRECOGNIZED'
    return {
      moduleNames: normalizeList(value.moduleNames),
      menuPaths: normalizeList(value.menuPaths),
      problemCategory: category,
      recognitionStatus: status,
      evidence: normalizeList(value.evidence, EVIDENCE),
    }
  } catch {
    return null
  }
}

export function parseConsultRecognition(text: string): { answer: string; recognition: ConsultRecognition | null } {
  let recognition: ConsultRecognition | null = null
  for (const match of text.matchAll(BLOCK_RE)) {
    recognition = parseBlock(match[1]) ?? recognition
  }
  return { answer: stripConsultRecognition(text), recognition }
}

export function stripConsultRecognition(text: string): string {
  return text.replace(BLOCK_RE, '').replace(INCOMPLETE_BLOCK_RE, '').trim()
}
