export type DependencyState = 'READY' | 'MISSING' | 'INCOMPATIBLE' | 'ATTENTION' | 'CHECKING'

export interface ForgeDependency {
  id: string
  name: string
  state: DependencyState
  blocking: boolean
  version: string | null
  summary: string
  detail: string | null
  installCommand: string | null
  officialUrl: string | null
}

export interface ForgeDependencyGroup {
  id: string
  name: string
  description: string
  items: ForgeDependency[]
}

export interface ForgeEnvironmentSnapshot {
  state: 'READY' | 'ATTENTION' | 'BLOCKED'
  ready: boolean
  readyCount: number
  totalCount: number
  blockingCount: number
  checkedAt: string
  groups: ForgeDependencyGroup[]
}

export type BootstrapStepState = 'PENDING' | 'RUNNING' | 'SKIPPED' | 'SUCCEEDED' | 'FAILED'

export interface BootstrapStep {
  id: string
  name: string
  state: BootstrapStepState
  message: string
  detail?: string | null
}

export interface RestartRequiredEvent {
  message: string
  completed: string[]
}

export interface BusinessRepositoryStatus {
  name: string
  path: string
  cloned: boolean
  status: string
  message: string
  openSpec?: {
    initialized: boolean
    claudeConfigured: boolean
    codexConfigured: boolean
    status: 'READY' | 'PARTIAL' | 'MISSING' | 'NOT_AVAILABLE'
    message: string
  }
}

export interface BusinessSystemWorkspace {
  id: 'erp' | 'erp-mini-program' | 'srm' | 'scm'
  name: string
  workspacePath: string
  ready: boolean
  status: 'READY' | 'PARTIAL' | 'NOT_CLONED' | 'BLOCKED'
  message: string
  members: BusinessRepositoryStatus[]
}
