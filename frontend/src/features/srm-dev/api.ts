import { http } from '@/lib/api'

/** SRM 测试库（MySQL 只读）连接（脱敏视图，不含密码）。 */
export interface SrmDbConfigView {
  host: string
  port: number | null
  database: string
  user: string
  configured: boolean
  hasPassword: boolean
}

export interface SrmDbSaveRequest {
  host: string
  port: number | null
  database: string
  user: string
  /** 留空=保留原密码（只改地址不重填密码）。 */
  password?: string
}

/** 读当前连接配置（后端不回传密码）。 */
export function getSrmDbConfig() {
  return http<SrmDbConfigView>('/claude-chat/srm-db/config')
}

/** 保存连接配置。 */
export function saveSrmDbConfig(body: SrmDbSaveRequest) {
  return http<SrmDbConfigView>('/claude-chat/srm-db/config', { method: 'PUT', body: JSON.stringify(body) })
}

/** 测试连通性。 */
export function testSrmDb() {
  return http<{ ok: boolean; error?: string }>('/claude-chat/srm-db/test', { method: 'POST' })
}

/* SRM 服务启停 + 启动日志走通用 devkit：@/features/_devkit/devServiceApi（serviceId='srm'）。 */

/** SRM 本地实例（yudao 网关，验证用）连接（脱敏视图，不含密码）。 */
export interface SrmAppConfigView {
  baseUrl: string
  loginPath: string
  tenantId: string
  tokenJsonPath: string
  username: string
  configured: boolean
  hasPassword: boolean
}

export interface SrmAppSaveRequest {
  baseUrl: string
  loginPath: string
  tenantId: string
  tokenJsonPath: string
  username: string
  /** 留空=保留原密码（只改地址不重填密码）。 */
  password?: string
}

/** 读本地实例配置（后端不回传密码）。 */
export function getSrmAppConfig() {
  return http<SrmAppConfigView>('/claude-chat/srm-app/config')
}

/** 保存本地实例配置。 */
export function saveSrmAppConfig(body: SrmAppSaveRequest) {
  return http<SrmAppConfigView>('/claude-chat/srm-app/config', { method: 'PUT', body: JSON.stringify(body) })
}

/** 测试登录/连通性。 */
export function testSrmApp() {
  return http<{ ok: boolean; error?: string }>('/claude-chat/srm-app/test', { method: 'POST' })
}
