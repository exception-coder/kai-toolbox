/** 系统中间件台前端类型，对应后端 /api/ops 的 DTO。 */

export type DatasourceType = 'MYSQL' | 'ORACLE' | 'REDIS' | 'RABBITMQ' | 'KAFKA'
export type DatasourceCategory = 'SQL' | 'REDIS' | 'MQ'

export interface SystemView {
  id: string
  name: string
  code: string | null
  owner: string | null
  description: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface SystemPayload {
  name: string
  code?: string
  owner?: string
  description?: string
  sortOrder?: number
}

export interface DatasourceView {
  id: string
  systemId: string
  env: string
  type: DatasourceType
  category: DatasourceCategory
  queryable: boolean
  name: string
  host: string
  port: number
  username: string | null
  passwordConfigured: boolean
  dbName: string | null
  params: string | null
  note: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
  endpoint: string
}

export interface DatasourcePayload {
  systemId: string
  env: string
  type: DatasourceType
  name: string
  host: string
  port: number
  username?: string
  password?: string
  dbName?: string
  params?: string
  note?: string
  sortOrder?: number
}

export interface TestResult {
  ok: boolean
  message: string
  elapsedMs: number
}

export interface SqlQueryResult {
  columns: string[]
  rows: (string | null)[][]
  rowCount: number
  updateCount: number
  truncated: boolean
  elapsedMs: number
}

export interface RedisExecResult {
  command: string
  result: unknown
  elapsedMs: number
}

export interface HistoryView {
  id: string
  datasourceId: string
  kind: string
  content: string
  status: 'OK' | 'ERROR'
  rowCount: number | null
  elapsedMs: number | null
  errorMsg: string | null
  executedAt: number
}
