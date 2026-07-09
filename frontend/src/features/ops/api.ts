import { http } from '@/lib/api'
import type {
  DatasourcePayload,
  DatasourceView,
  HistoryDetailView,
  HistoryView,
  RedisExecResult,
  SqlQueryResult,
  SystemPayload,
  SystemView,
  TestResult,
} from './types'

/* ---------- 系统 ---------- */

export function listSystems() {
  return http<SystemView[]>('/ops/systems')
}

export function createSystem(payload: SystemPayload) {
  return http<SystemView>('/ops/systems', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateSystem(id: string, payload: SystemPayload) {
  return http<SystemView>(`/ops/systems/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteSystem(id: string) {
  return http<void>(`/ops/systems/${id}`, { method: 'DELETE' })
}

/* ---------- 中间件实例 ---------- */

export function listDatasources(systemId?: string) {
  const q = systemId ? `?systemId=${encodeURIComponent(systemId)}` : ''
  return http<DatasourceView[]>(`/ops/datasources${q}`)
}

export function createDatasource(payload: DatasourcePayload) {
  return http<DatasourceView>('/ops/datasources', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateDatasource(id: string, payload: DatasourcePayload) {
  return http<DatasourceView>(`/ops/datasources/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteDatasource(id: string) {
  return http<void>(`/ops/datasources/${id}`, { method: 'DELETE' })
}

export function testDatasource(id: string) {
  return http<TestResult>(`/ops/datasources/${id}/test`, { method: 'POST' })
}

/* ---------- 查询 ---------- */

export function sqlQuery(id: string, sql: string, maxRows?: number) {
  return http<SqlQueryResult>(`/ops/datasources/${id}/sql/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, maxRows }),
  })
}

export function redisExec(id: string, command: string) {
  return http<RedisExecResult>(`/ops/datasources/${id}/redis/exec`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

export function listHistory(id: string, limit = 50) {
  return http<HistoryView[]>(`/ops/datasources/${id}/history?limit=${limit}`)
}

export function getHistoryDetail(id: string, historyId: string) {
  return http<HistoryDetailView>(`/ops/datasources/${id}/history/${historyId}`)
}
