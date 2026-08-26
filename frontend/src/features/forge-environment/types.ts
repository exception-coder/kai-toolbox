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
