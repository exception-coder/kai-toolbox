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
  sourcePath?: string
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
  snapshotAt: string
  freshness: 'FRESH' | 'STALE'
  workflow?: {
    state: string
    missingArtifacts: string[]
    missingPrerequisites: string[]
    artifacts: Array<{ id: string; status: string; missingDeps: string[] }>
  }
}
