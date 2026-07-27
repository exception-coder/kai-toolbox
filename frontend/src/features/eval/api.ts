import { http } from '@/lib/api'
import type {
  AdapterInfo,
  DatasetStat,
  DiffReport,
  EvalCase,
  EvalPrompt,
  EvalResult,
  EvalRun,
  ExtractionSummary,
  HarvestResult,
  SampleSource,
  SaveCaseRequest,
  StartRunRequest,
} from './types'

const BASE = '/eval'

// ---- 用例 ----------------------------------------------------------------

export const listCases = (params?: { scenario?: string; dataset?: string }) => {
  const q = new URLSearchParams()
  if (params?.scenario) q.set('scenario', params.scenario)
  if (params?.dataset) q.set('dataset', params.dataset)
  const qs = q.toString()
  return http<EvalCase[]>(`${BASE}/cases${qs ? `?${qs}` : ''}`)
}

export const listDatasets = () => http<DatasetStat[]>(`${BASE}/cases/datasets`)

export const getCase = (id: string) => http<EvalCase>(`${BASE}/cases/${id}`)

export const createCase = (body: SaveCaseRequest) =>
  http<EvalCase>(`${BASE}/cases`, { method: 'POST', body: JSON.stringify(body) })

export const updateCase = (id: string, body: SaveCaseRequest) =>
  http<EvalCase>(`${BASE}/cases/${id}`, { method: 'PUT', body: JSON.stringify(body) })

export const deleteCase = (id: string) =>
  http<void>(`${BASE}/cases/${id}`, { method: 'DELETE' })

export const listSources = () => http<SampleSource[]>(`${BASE}/cases/sources`)

export const harvest = (source: string, opts?: { dataset?: string; refresh?: boolean }) => {
  const q = new URLSearchParams({ source })
  if (opts?.dataset) q.set('dataset', opts.dataset)
  if (opts?.refresh) q.set('refresh', 'true')
  return http<HarvestResult>(`${BASE}/cases/harvest?${q.toString()}`, { method: 'POST' })
}

export const importCases = (body: SaveCaseRequest[]) =>
  http<{ received: number; created: number; skipped: number }>(`${BASE}/cases/import`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

// ---- 运行与报告 ----------------------------------------------------------

export const listAdapters = () => http<AdapterInfo[]>(`${BASE}/runs/adapters`)

export const startRun = (body: StartRunRequest) =>
  http<EvalRun>(`${BASE}/runs`, { method: 'POST', body: JSON.stringify(body) })

export const listRuns = (dataset?: string, limit = 50) => {
  const q = new URLSearchParams({ limit: String(limit) })
  if (dataset) q.set('dataset', dataset)
  return http<EvalRun[]>(`${BASE}/runs?${q.toString()}`)
}

export const getRun = (id: string) => http<EvalRun>(`${BASE}/runs/${id}`)

export const listResults = (runId: string) => http<EvalResult[]>(`${BASE}/runs/${runId}/results`)

export const getExtractionSummary = (runId: string) =>
  http<ExtractionSummary>(`${BASE}/runs/${runId}/extraction-summary`)

export const getDiff = (base: string, target: string) =>
  http<DiffReport>(`${BASE}/runs/diff?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`)

export const deleteRun = (id: string) => http<void>(`${BASE}/runs/${id}`, { method: 'DELETE' })

// ---- 提示词 --------------------------------------------------------------

export const listPrompts = (key: string) =>
  http<EvalPrompt[]>(`${BASE}/prompts?key=${encodeURIComponent(key)}`)

export const addPrompt = (body: { promptKey: string; content: string; note?: string; activate?: boolean }) =>
  http<EvalPrompt>(`${BASE}/prompts`, { method: 'POST', body: JSON.stringify(body) })

export const activatePrompt = (key: string, version: number) =>
  http<void>(`${BASE}/prompts/${encodeURIComponent(key)}/activate/${version}`, { method: 'POST' })
