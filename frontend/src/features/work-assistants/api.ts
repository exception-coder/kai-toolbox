import { http } from '@/lib/api'

export interface Assistant { id: string; name: string; description: string; skill: string; skillHash: string; enabled: boolean }
export interface Project { id: string; name: string; path: string }
export interface Catalog { assistants: Assistant[]; projects: Project[] }
export interface Turn { id: string; requestId: string; input: string; output: string; status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; error?: string; createdAt: number }
export interface Session { id: string; assistantId: string; title: string; skillHash: string; engine: string; model?: string; createdAt: number; turns: Turn[] }
export interface Scope { projectIds: string[]; from: string; through: string; author: string }
const base = '/work-assistants'
const post = <T,>(path: string, body: unknown) => http<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const getCatalog = () => http<Catalog>(`${base}/catalog`)
export const listSessions = () => http<Session[]>(`${base}/sessions`)
export const getSession = (id: string) => http<Session>(`${base}/sessions/${encodeURIComponent(id)}`)
export const createSession = (body: { assistantId: string; newTask: boolean; requestId: string; engine: string; model: string; scope: Scope }) => post<Session>(`${base}/sessions`, body)
export const sendMessage = (id: string, requestId: string, input: string) => post<Turn>(`${base}/sessions/${encodeURIComponent(id)}/messages`, { requestId, input })
export const cancelTurn = (id: string, turn: string) => post<void>(`${base}/sessions/${encodeURIComponent(id)}/turns/${encodeURIComponent(turn)}/cancel`, {})
export const resolveWeeklyRequest = (body: { projectIds: string[]; input: string; engine: string; model: string }) => post<{ scope: Scope | null; message: string }>(`${base}/weekly/resolve`, body)
export interface Enrollment {
  requestId: string; kind: 'DATABASE' | 'APPLICATION' | 'HOST'; name: string; environment: string; systemId: string;
  type: string; host: string; port: number; database: string; baseUrl: string; loginPath: string; username: string; password: string
}
export const enrollResource = (body: Enrollment) => post<{ resourceId: string; configurationUrl: string }>('/ops/assistant-enrollment', body)
export const listResourceGroups = () => http<{ id: string; name: string }[]>('/ops/systems')
