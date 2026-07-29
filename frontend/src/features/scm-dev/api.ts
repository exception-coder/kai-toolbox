import { http } from '@/lib/api'

/** SCM 测试库（MySQL 只读）连接。内部单用户系统，回显密码明文供核对/纠正。 */
export interface ScmDbConfigView {
  host: string
  port: number | null
  database: string
  user: string
  configured: boolean
  hasPassword: boolean
  /** 已存密码明文（内部系统直接回显；未配置时为空串）。 */
  password: string
}

export interface ScmDbSaveRequest {
  host: string
  port: number | null
  database: string
  user: string
  /** 留空=保留原密码（只改地址不重填密码）。 */
  password?: string
}

/** 读当前连接配置（后端不回传密码）。 */
export function getScmDbConfig() {
  return http<ScmDbConfigView>('/claude-chat/scm-db/config')
}

/** 保存连接配置。 */
export function saveScmDbConfig(body: ScmDbSaveRequest) {
  return http<ScmDbConfigView>('/claude-chat/scm-db/config', { method: 'PUT', body: JSON.stringify(body) })
}

/** 测试连通性。 */
export function testScmDb() {
  return http<{ ok: boolean; error?: string }>('/claude-chat/scm-db/test', { method: 'POST' })
}

/* SCM 服务启停 + 启动日志走通用 devkit：@/features/_devkit/devServiceApi（serviceId='scm'）。 */
