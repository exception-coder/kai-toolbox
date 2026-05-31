/** 与后端 /api/docker/* DTO 对应的前端类型。 */

export interface DockerAppView {
  id: string
  hostId: string
  name: string
  baseDir: string
  composeFile: string
  note: string | null
  createdAt: number
  updatedAt: number
}

export interface DockerAppPayload {
  name: string
  baseDir: string
  composeFile?: string
  note?: string
  skipValidate?: boolean
}

export interface ScannedAppView {
  baseDir: string
  composeFile: string
  name: string
  registered: boolean
  existingAppId: string | null
}

export interface ContainerView {
  id: string
  shortId: string
  name: string
  image: string
  state: string
  status: string
  createdAt: number
  ports: string
  composeProject: string | null
  composeService: string | null
  appId: string | null
}

export interface ContainerStatsView {
  id: string
  name: string
  cpuPercent: number
  memUsageBytes: number
  memLimitBytes: number
  memPercent: number
  netRxBytes: number
  netTxBytes: number
  blockReadBytes: number
  blockWriteBytes: number
}

export interface ContainerStatsResponse {
  snapshotAt: number
  items: ContainerStatsView[]
}

export type ContainerAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill'
export type ComposeAction = 'up' | 'down' | 'restart' | 'pull'

export interface ComposeActionRequest {
  detach?: boolean
  removeOrphans?: boolean
  pullPolicy?: 'always' | 'missing' | 'never'
}

export interface ComposeActionResponse {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface ComposeFileView {
  path: string
  name: string
  sizeBytes: number
  modifiedAt: number
}

export interface FileContentView {
  path: string
  content: string
  sizeBytes: number
  modifiedAt: number
}

export interface FileWriteResponse {
  path: string
  backupPath: string
  sizeBytes: number
  modifiedAt: number
}

export interface LogTailResponse {
  lines: string[]
  truncated: boolean
}
