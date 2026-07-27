/** 与 tool-eval 后端 domain / DTO 对齐。字段名保持 camelCase（后端 Jackson 默认输出）。 */

export type Scenario = 'EXTRACTION' | 'RAG_QA' | 'GENERATION' | 'AGENT_TRACE'
export type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED'
export type Verdict = 'PASS' | 'FAIL' | 'ERROR'

export interface EvalCase {
  id: string
  scenario: string
  dataset: string
  title: string
  inputJson: string
  expectedJson: string
  assertJson?: string | null
  tags?: string | null
  sourceRef?: string | null
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface DatasetStat {
  scenario: string
  dataset: string
  total: number
  enabledCount: number
}

export interface EvalRun {
  id: string
  scenario: string
  dataset: string
  adapter: string
  model?: string | null
  promptKey?: string | null
  promptVersion?: number | null
  status: RunStatus
  total: number
  passed: number
  failed: number
  errored: number
  note?: string | null
  error?: string | null
  startedAt: number
  finishedAt?: number | null
}

/** 单条断言明细，来自 eval_result.assertions_json */
export interface AssertionOutcome {
  type: string
  path: string
  passed: boolean
  weight: number
  expected?: string | null
  actual?: string | null
  message?: string | null
}

export interface EvalResult {
  id: string
  runId: string
  caseId: string
  caseTitle?: string | null
  verdict: Verdict
  score: number
  outputJson?: string | null
  rawOutput?: string | null
  assertionsJson?: string | null
  error?: string | null
  latencyMs: number
  createdAt: number
}

export interface AdapterInfo {
  id: string
  scenario: string
  promptKey: string
}

export interface DiffItem {
  caseId: string
  caseTitle?: string | null
  baseVerdict?: string | null
  targetVerdict?: string | null
  baseScore?: number | null
  targetScore?: number | null
  targetError?: string | null
  targetAssertions?: string | null
}

export interface DiffReport {
  base: EvalRun
  target: EvalRun
  regressed: DiffItem[]
  fixed: DiffItem[]
  stillFailing: DiffItem[]
  unchangedPass: number
}

/** 场景 ② 专用：isBug 判定的混淆矩阵 */
export interface ExtractionSummary {
  runId: string
  truePositive: number
  falsePositive: number
  falseNegative: number
  trueNegative: number
  skipped: number
  precision: number
  recall: number
  f1: number
}

export interface StartRunRequest {
  adapter: string
  dataset: string
  model?: string
  promptVersion?: number
  note?: string
}

export interface SaveCaseRequest {
  scenario: string
  dataset: string
  title: string
  inputJson: string
  expectedJson: string
  assertJson?: string
  tags?: string
  sourceRef?: string
  enabled?: boolean
}

export interface EvalPrompt {
  id: string
  promptKey: string
  version: number
  content: string
  note?: string | null
  active: boolean
  createdAt: number
}
