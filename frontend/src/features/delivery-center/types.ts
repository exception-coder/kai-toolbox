export type StageStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'MISSING'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'ERROR'

export type DeliveryStageKey =
  | 'prdDraft'
  | 'prdClarify'
  | 'prd'
  | 'tddClarify'
  | 'tdd'
  | 'code'
  | 'test'
  | 'runtime'

export type FindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

export interface DeliverySummary {
  requirementCount: number
  prdCompletion: number
  tddCompletion: number
  codeProgress: number | null
  assessmentCoverage: number
  overallProgress: number
  confidence: number
  healthScore: number
  healthGrade: string
  completedCount: number
  partialCount: number
  missingCount: number
  unassessedCount: number
  highRiskCount: number
}

export interface StageView {
  status: StageStatus
  score: number | null
  updatedAt: number | null
  note: string
}

export interface ProgressItem {
  title: string
  evidence: string[]
  implemented: string
  missing: string
  expected: string
  actual: string
  testItem?: boolean
  unitTest?: boolean
}

export interface EffortProgress {
  baselineHoursMin: number
  baselineHoursMax: number
  baselineWorkdaysMin: number
  baselineWorkdaysMax: number
  codeProgress: number | null
  deliveryProgress: number
  completedHoursMin: number | null
  completedHoursMax: number | null
  remainingHoursMin: number | null
  remainingHoursMax: number | null
  remainingWorkdaysMin: number | null
  remainingWorkdaysMax: number | null
  hoursPerWorkday: number
  estimatedAt: number
  analyzedAt: number | null
  baselineStale: boolean
  baselineStaleReasons: string[]
}

export interface DeliveryRequirement {
  id: string
  parentId: string | null
  title: string
  project: string
  module: string
  status: string
  documentProfile: 'CLASSIC' | 'SPEC_DRIVEN'
  updatedAt: number
  links: {
    prd: string
    development: string | null
    workspace: string
  }
  stages: {
    prdDraft: StageView
    prdClarify: StageView
    prd: StageView
    tddClarify: StageView
    tdd: StageView
    code: StageView
    test: StageView
    runtime: StageView
  }
  coverage: {
    completed: number
    partial: number
    missing: number
    total: number
  }
  overallProgress: number
  overallProgressVariants?: {
    includingTests: number
    excludingTests: number
  }
  evidenceMode: 'VERIFIED_LEDGER' | 'LEGACY_UNVERIFIED' | 'UNASSESSED'
  verifiedClaimCount: number
  invalidEvidenceCount: number
  verification: DeliveryVerificationRun | null
  availableVerificationCommands: DeliveryVerificationCommand[]
  codeScoreVariants?: {
    includingTests?: number | null
    excludingTests?: number | null
    testItemCount?: number
    includingUnitTests?: number | null
    excludingUnitTests?: number | null
    unitTestItemCount?: number
  }
  progressItems: {
    completed: ProgressItem[]
    partial: ProgressItem[]
    missing: ProgressItem[]
    excluded: ProgressItem[]
  }
  /** 原 AI 总工时基线与最新代码实现进度的确定性对照。 */
  effortProgress?: EffortProgress | null
  alignmentFindings: Array<{
    requirement: string
    expected: string
    actual: string
    status: string
  }>
  confidence: number
  healthScore: number
  healthGrade: string
  staleReasons: string[]
}

export interface DeliveryVerificationRun {
  id: string
  commandId: string
  gitHead: string
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ERROR'
  exitCode: number | null
  testCount: number | null
  outputSummary: string | null
  lastError: string | null
  startedAt: number
  finishedAt: number | null
  stale: boolean
}

export interface DeliveryVerificationCommand {
  id: string
  label: string
}

export interface DeliveryFinding {
  id: string
  requirementId: string
  type: string
  severity: FindingSeverity
  title: string
  evidence: string
  recommendation: string
}

export interface DeliveryOverview {
  generatedAt: number
  summary: DeliverySummary
  filters: {
    projects: string[]
    modules: string[]
  }
  requirements: DeliveryRequirement[]
  findings: DeliveryFinding[]
  warnings: string[]
}
