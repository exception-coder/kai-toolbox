export type MagnetTaskState =
  | 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'REMOVED'

export interface MagnetTaskView {
  gid: string
  state: MagnetTaskState
  displayName: string
  totalLength: number
  completedLength: number
  uploadLength: number
  downloadSpeedBps: number
  uploadSpeedBps: number
  numSeeders: number
  numConnections: number
  errorCode: number | null
  errorMessage: string | null
  files: string[]
  infoHash: string | null
  savePath: string | null
  resolvedByCache: boolean
}

export interface HealthResponse {
  available: boolean
  reason: string | null
}

export interface AddUriRequest {
  uri: string
  savePath?: string | null
}

export interface AddTorrentRequest {
  contentBase64: string
  savePath?: string | null
}

export interface AddUriResponse {
  gid: string
  resolvedByCache: boolean
}
