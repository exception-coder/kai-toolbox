export type RouteCheckStatus = 'PASS' | 'WARNING' | 'UNVERIFIED' | 'FAIL'

export interface SystemRouteCandidate {
  projectKey: string
  displayName: string
  projectPath: string
  source: string
  sourceAvailable: boolean
  knowledgeAvailable: boolean
}

export interface ProjectRouteBinding extends SystemRouteCandidate {
  aliases: string[]
  explicit: boolean
  message: string
}

export interface ProjectRouteModule {
  key: string
  name: string
  codePath: string
  webPaths: string[]
  summary: string
  source: string
}

export interface EvidenceProject {
  projectKey: string
  projectPath: string
  relation: string
  projectRole: string
  availability: Record<string, boolean>
}

export interface ProjectRouteContext {
  requestedProject: string
  projectKey: string
  projectPath: string
  displayName: string
  aliases: string[]
  bindingSource: string
  requestedModule: string
  requestedUrl: string
  modules: ProjectRouteModule[]
  matchedModules: ProjectRouteModule[]
  urlRouteMatches: string[]
  evidenceScope: {
    scopeId: string
    primary: EvidenceProject
    relatedProjects: EvidenceProject[]
  }
  diagnostics: string[]
}

export interface SystemRouteInspection {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNVERIFIED' | 'BROKEN'
  summary: string
  route: ProjectRouteContext | null
  runtimeTools: {
    status: 'VERIFIED' | 'UNAVAILABLE'
    targetSystems: string[]
    tools: Array<{ server: string; tool: string }>
    protocolVersion: number | null
  }
  menuTools: Array<{ id: string; name: string; route: string; description: string }>
  checks: Array<{
    code: string
    status: RouteCheckStatus
    title: string
    explanation: string
    recoveryAction: string
    evidence: string
  }>
}
