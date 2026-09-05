export type OpenSpecProjectState = 'READY' | 'NOT_INITIALIZED' | 'TOOL_UNAVAILABLE' | 'ERROR'
export type OpenSpecChangeState = 'IN_PROGRESS' | 'COMPLETE' | 'ATTENTION'
export type OpenSpecTaskState = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE'

export interface OpenSpecChangeSummary {
  id: string
  title: string
  state: OpenSpecChangeState
  completedTasks: number
  totalTasks: number
  lastModified: string | null
}

export interface OpenSpecProjectSummary {
  id: string
  name: string
  state: OpenSpecProjectState
  message: string
  changes: OpenSpecChangeSummary[]
  completedTasks: number
  totalTasks: number
  snapshotAt: string
}

export interface OpenSpecBoardList {
  projects: OpenSpecProjectSummary[]
  snapshotAt: string
}

export interface OpenSpecRuntimeEvidence {
  sessionId: string
  engine: string
  phase: string
  lastActivityAt: string
  attentionReason: string | null
}

export interface OpenSpecTask {
  id: string
  outlineId: string
  description: string
  section: string
  state: OpenSpecTaskState
  runtime: OpenSpecRuntimeEvidence | null
}

export type OpenSpecAffectedApiChangeType = 'ADDED' | 'MODIFIED' | 'REMOVED'
export type OpenSpecAffectedApiVerificationStatus = 'UNVERIFIED' | 'PASSED' | 'FAILED' | 'NOT_APPLICABLE'

export interface OpenSpecAffectedApiEvidence {
  sessionId: string
  httpMethod: string
  apiPath: string
  changeType: OpenSpecAffectedApiChangeType
  sourceFile: string
  handlerName: string | null
  summary: string | null
  verificationStatus: OpenSpecAffectedApiVerificationStatus
  verificationMethod: string | null
  verificationSummary: string | null
  updatedAt: string
}

export interface OpenSpecChangeDetail {
  projectId: string
  projectName: string
  changeId: string
  title: string
  state: OpenSpecChangeState
  completedTasks: number
  totalTasks: number
  artifactPaths: Record<string, string[]>
  tasks: OpenSpecTask[]
  affectedApis: OpenSpecAffectedApiEvidence[]
  snapshotAt: string
  freshness: 'FRESH' | 'STALE'
}
