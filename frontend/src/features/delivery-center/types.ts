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
}

export interface DeliveryRequirement {
  id: string
  parentId: string | null
  title: string
  project: string
  module: string
  status: string
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
  progressItems: {
    completed: ProgressItem[]
    partial: ProgressItem[]
    missing: ProgressItem[]
  }
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
