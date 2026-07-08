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
