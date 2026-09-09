import { http } from '@/lib/api'

export interface DomainDraft {
  id: string; name: string; kind: 'BUSINESS' | 'TECHNICAL'; summary: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  responsibilities: string[]; flows: string[]; unknowns: string[]; communities: string[]
  evidence: { path: string; startLine: number; endLine: number; quote: string; nodeId: string }[]
  mappings: { kind: 'ROUTE' | 'API' | 'TABLE'; value: string; evidenceIndex: number }[]
}
export interface DomainRun {
  id: string; engine: string; scope: string; status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  stage: string; startedAt: number; updatedAt: number; error: string | null
}
export interface DomainView {
  snapshot: { version: number; generatedAt: number; engine: string; scope: string; domains: DomainDraft[]; gaps: string[] } | null
  run: DomainRun | null; stale: boolean; message: string
}
const path = (id: string) => `/project-registry/${encodeURIComponent(id)}/domains`
export const getDomains = (id: string) => http<DomainView>(path(id))
export const exploreDomains = (id: string, engine: 'codex' | 'claude', scope: string) =>
  http<DomainRun>(`${path(id)}/explore`, { method: 'POST', body: JSON.stringify({ engine, scope }) })
