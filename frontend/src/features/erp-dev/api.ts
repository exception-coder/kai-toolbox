import { http } from '@/lib/api'

/** ERP 测试库连接（脱敏视图，不含密码）。 */
export interface ErpDbConfigView {
  type: string
  host: string
  port: number | null
  service: string
  user: string
  configured: boolean
  hasPassword: boolean
}

export interface ErpDbSaveRequest {
  type: string
  host: string
  port: number | null
  service: string
  user: string
  /** 留空=保留原密码（只改地址不重填密码）。 */
  password?: string
}

/** 读当前连接配置（后端不回传密码）。 */
export function getErpDbConfig() {
  return http<ErpDbConfigView>('/claude-chat/erp-db/config')
}

/** 保存连接配置。 */
export function saveErpDbConfig(body: ErpDbSaveRequest) {
  return http<ErpDbConfigView>('/claude-chat/erp-db/config', { method: 'PUT', body: JSON.stringify(body) })
}

/** 测试连通性。 */
export function testErpDb() {
  return http<{ ok: boolean; error?: string }>('/claude-chat/erp-db/test', { method: 'POST' })
}

/** 系统中间件台的系统（精简）。 */
export interface OpsSystemLite {
  id: string
  name: string
  code: string | null
}

/** 系统中间件台的中间件实例（精简，脱敏）。 */
export interface OpsDatasourceLite {
  id: string
  systemId: string
  env: string
  type: string
  name: string
  host: string
  port: number
  dbName: string | null
  endpoint: string
  passwordConfigured: boolean
}

/** 列中间件台的系统。 */
export function listOpsSystems() {
  return http<OpsSystemLite[]>('/ops/systems')
}

/** 列某系统下的中间件实例。 */
export function listOpsDatasources(systemId: string) {
  return http<OpsDatasourceLite[]>(`/ops/datasources?systemId=${encodeURIComponent(systemId)}`)
}

/**
 * 把中间件台某数据源带入 ERP 只读连接（仅 ORACLE）。密码经后端回环流转、不进浏览器。
 * 成功回脱敏配置视图；失败回 {ok:false,error}。
 */
export function importErpDbFromOps(datasourceId: string) {
  return http<ErpDbConfigView | { ok: false; error: string }>(
    `/claude-chat/erp-db/import/${encodeURIComponent(datasourceId)}`, { method: 'PUT' })
}

/* ---------- ERP 服务启停 + 启动日志 ---------- */

export interface ErpServiceStatus {
  running: boolean
  pid: number | null
  workDir: string | null
  command: string | null
  startedAt: number | null
  uptimeMs: number | null
}

type ErpServiceResult = ErpServiceStatus | { ok: false; error: string }

/** SSE 日志流地址（EventSource 直连，经 Vite /api 代理）。 */
export const ERP_SERVICE_LOG_STREAM = '/api/claude-chat/erp-service/logs/stream'

export function getErpServiceStatus() {
  return http<ErpServiceStatus>('/claude-chat/erp-service/status')
}

/** 当前日志快照（初次加载，随后走 SSE 增量）。 */
export function getErpServiceLogs() {
  return http<string[]>('/claude-chat/erp-service/logs')
}

/** 启动服务（command 留空=默认 start-yoooni.ps1）。 */
export function startErpService(cwd: string, command?: string) {
  return http<ErpServiceResult>('/claude-chat/erp-service/start', {
    method: 'POST', body: JSON.stringify({ cwd, command: command || undefined }),
  })
}

/** 停止服务。 */
export function stopErpService(stopCommand?: string) {
  return http<ErpServiceResult>('/claude-chat/erp-service/stop', {
    method: 'POST', body: JSON.stringify({ stopCommand: stopCommand || undefined }),
  })
}

/** 重启服务（先停再起，让改动生效）。 */
export function restartErpService(cwd: string, command?: string, stopCommand?: string) {
  return http<ErpServiceResult>('/claude-chat/erp-service/restart', {
    method: 'POST', body: JSON.stringify({ cwd, command: command || undefined, stopCommand: stopCommand || undefined }),
  })
}

/** 本地 ERP 实例（验证用）连接（脱敏视图，不含密码）。 */
export interface ErpAppConfigView {
  baseUrl: string
  loginPath: string
  userField: string
  passField: string
  username: string
  configured: boolean
  hasPassword: boolean
}

export interface ErpAppSaveRequest {
  baseUrl: string
  loginPath: string
  userField: string
  passField: string
  username: string
  /** 留空=保留原密码（只改地址不重填密码）。 */
  password?: string
}

/** 读本地实例配置（后端不回传密码）。 */
export function getErpAppConfig() {
  return http<ErpAppConfigView>('/claude-chat/erp-app/config')
}

/** 保存本地实例配置。 */
export function saveErpAppConfig(body: ErpAppSaveRequest) {
  return http<ErpAppConfigView>('/claude-chat/erp-app/config', { method: 'PUT', body: JSON.stringify(body) })
}

/** 测试登录/连通性。 */
export function testErpApp() {
  return http<{ ok: boolean; error?: string }>('/claude-chat/erp-app/test', { method: 'POST' })
}
