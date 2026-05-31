/** frp 角色：服务端 frps 或客户端 frpc */
export type FrpMode = 'frps' | 'frpc'

/** 单个代理类型 */
export type ProxyType = 'tcp' | 'udp' | 'http' | 'https' | 'stcp' | 'xtcp'

export interface ProxyEntry {
  /** 唯一标识，前端 UI 用 */
  uid: string
  /** TOML 中的 name，须全局唯一 */
  name: string
  type: ProxyType
  localIp: string
  localPort: string
  /** TCP/UDP 用 */
  remotePort: string
  /** HTTP/HTTPS 用，逗号分隔的域名 */
  customDomains: string
  /** HTTP 子域名（要求 frps 配 subdomainHost） */
  subdomain: string
  /** 是否启用端口段范围模式 */
  rangeMode: boolean
  /** range 模式下覆盖 localPort */
  localPortsRange: string
  /** range 模式下覆盖 remotePort */
  remotePortsRange: string
}

/** frps 服务端配置 */
export interface FrpsConfig {
  bindPort: string
  bindAddr: string
  authToken: string
  vhostHttpPort: string
  vhostHttpsPort: string
  subdomainHost: string
  dashboardEnabled: boolean
  dashboardAddr: string
  dashboardPort: string
  dashboardUser: string
  dashboardPwd: string
  logLevel: string
  logFile: string
  maxLogDays: string
  /** 允许的端口段（多行：6000-7000 / 8080 / 8443） */
  allowPortsText: string
}

/** frpc 客户端配置 */
export interface FrpcConfig {
  serverAddr: string
  serverPort: string
  authToken: string
  user: string
  logLevel: string
  logFile: string
  maxLogDays: string
  webEnabled: boolean
  webAddr: string
  webPort: string
  webUser: string
  webPwd: string
  proxies: ProxyEntry[]
}

/** 远端定位：选哪台主机 + frp 装在哪个目录。主机本身由「主机管理」模块统一维护。 */
export interface FrpTargetForm {
  /** /api/hosts 里登记的主机 id；空串 = 未选 */
  hostId: string
  /** frp 安装目录绝对路径 */
  installDir: string
}

/** 整页表单状态 */
export interface FrpConfigState {
  mode: FrpMode
  target: FrpTargetForm
  frps: FrpsConfig
  frpc: FrpcConfig
}

/** 后端 DTO */
export interface TestConnectionResult {
  connected: boolean
  unameOutput: string | null
  installDirExists: boolean
  hasFrps: boolean
  hasFrpc: boolean
  hasFrpsToml: boolean
  hasFrpcToml: boolean
  version: string | null
  errorMessage: string | null
}

export interface ReadConfigResult {
  mode: FrpMode
  remotePath: string
  exists: boolean
  content: string
}

export interface WriteConfigResult {
  remotePath: string
  backupPath: string | null
  bytesWritten: number
}

export interface ServiceActionResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  running: boolean
  pids: string
}
