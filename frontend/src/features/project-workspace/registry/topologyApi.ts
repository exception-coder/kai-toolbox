import { http } from '@/lib/api'
import type { DomainDraft, DomainRun } from './domainApi'

export interface TopologyCitation { projectId: string; domainId: string; evidenceIndex: number }
export interface TopologyRelation {
  id: string; fromProjectId: string; toProjectId: string; kind: 'API' | 'DATA' | 'DEPENDENCY' | 'FLOW'
  summary: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; evidence: TopologyCitation[]; unknowns: string[]
}
export interface TopologyParticipant {
  projectId: string; name: string; root: string; findings: { domains: DomainDraft[]; gaps: string[] }
}
export interface TopologyView {
  snapshot: { version: number; generatedAt: number; engine: string; scope: string; participants: TopologyParticipant[]
    relations: TopologyRelation[]; gaps: string[] } | null
  run: DomainRun | null; stale: boolean; message: string
}
const path = (id: string) => `/project-registry/${encodeURIComponent(id)}/topology`
export const getTopology = (id: string) => http<TopologyView>(path(id))
export const exploreTopology = (id: string, input: { engine: 'codex' | 'claude'; scope: string; projectIds: string[] }) =>
  http<DomainRun>(`${path(id)}/explore`, { method: 'POST', body: JSON.stringify(input) })
