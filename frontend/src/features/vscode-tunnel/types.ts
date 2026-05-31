// 与后端 com.exceptioncoder.toolbox.vscodetunnel.domain.TunnelStatus 字段对齐。
// 后端是 java record，序列化为 camelCase JSON；这里保持同名。

export type TunnelState =
  | 'STOPPED'
  | 'STARTING'
  | 'AUTH_REQUIRED'
  | 'RUNNING'
  | 'STOPPING'
  | 'ERROR'

export interface TunnelStatus {
  state: TunnelState
  tunnelUrl: string | null
  deviceCode: string | null
  deviceLoginUrl: string | null
  tunnelName: string | null
  pid: number | null
  /** ISO-8601 字符串 */
  startedAt: string | null
  lastError: string | null
}

export interface StartRequest {
  tunnelName?: string
}

// 对齐后端 TunnelLauncher.CommandResult：exitCode=0 表示子命令成功
export interface CommandResult {
  exitCode: number
  output: string
}
