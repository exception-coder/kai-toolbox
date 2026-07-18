/** 与后端 /api/knowledge-graph/* 对应的前端类型。 */

export interface ProjectRef {
  path: string
  displayName: string
  lastUsedAt: string | null
}

export type GraphifyGraphState = 'NOT_GENERATED' | 'STALE' | 'UP_TO_DATE'

export interface GraphifyProjectStatus {
  state: GraphifyGraphState
  graphGeneratedAt: string | null
  latestCommitAt: string | null
  checkedAt: string
}

export type RegistrationState = 'NOT_REGISTERED' | 'PARTIAL' | 'REGISTERED'

export interface ModuleGap {
  moduleKey: string
  moduleName: string
  existingCount: number
  missingTypes: string[]
}

export interface DomainKnowledgeStatus {
  state: RegistrationState
  totalModules: number
  coveredModules: number
  gaps: ModuleGap[]
  checkedAt: string
}

/** 项目工作台跨项目筛选用的状态快照：两类图谱状态 + 检测时间，来自 /knowledge-graph/status-cache*。 */
export interface ProjectStatusSnapshot {
  projectPath: string
  graphifyState: GraphifyGraphState | null
  businessGraphState: RegistrationState | null
  businessGraphError: string | null
  checkedAt: string
}
