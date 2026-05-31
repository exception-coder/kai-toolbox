/** 全局 SSH 主机的前端类型，与后端 /api/hosts 的 DTO 对应。 */
export type HostAuthType = 'PASSWORD' | 'KEY'

/** 后端返回视图：不暴露密码 / passphrase 明文，只给「是否已配置」位。 */
export interface HostView {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: HostAuthType
  privateKey: string | null
  passwordConfigured: boolean
  passphraseConfigured: boolean
  tag: string | null
  note: string | null
  createdAt: number
  updatedAt: number
  /** username@host:port 拼好的展示字符串 */
  label: string
}

/** 创建 / 更新主机的入参。 password/passphrase 留空表示「保持原值」。 */
export interface HostPayload {
  name: string
  host: string
  port: number
  username: string
  authType: HostAuthType
  password?: string
  privateKey?: string
  passphrase?: string
  tag?: string
  note?: string
}

export interface TestHostResult {
  ok: boolean
  message: string
}
