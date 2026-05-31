export interface ScanView {
  id: string
  rootPath: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  startedAt: number
  finishedAt: number | null
  totalFiles: number
  totalDirs: number
  totalSize: number
  errorMsg: string | null
  sourceType: ScanSourceType
  sshHostId: string | null
  sourceDisplayName: string | null
}

export type ScanSourceType = 'LOCAL_WINDOWS' | 'SSH'

export interface StartScanPayload {
  path: string
  sourceType: ScanSourceType
  sshHostId?: string | null
}

export interface NodeView {
  path: string
  name: string
  dir: boolean
  size: number
  fileCount: number
  dirCount: number
  depth: number
  modifiedAt: number | null
}

export type CleanupCategory = 'LARGE_OLD' | 'DUPLICATE' | 'CACHE' | 'DOCKER' | 'DANGEROUS'
export type CleanupSafety = 'SAFE' | 'REVIEW' | 'DANGEROUS'

export interface CleanupCandidate {
  category: CleanupCategory
  safety: CleanupSafety
  path: string
  name: string
  dir: boolean
  size: number
  fileCount: number
  dirCount: number
  modifiedAt: number | null
  reason: string
  deleteHint: string
}

export interface ProgressEvent {
  scanned: number
  totalSize: number
  currentPath: string
}

export interface CompletedEvent {
  totalFiles: number
  totalDirs: number
  totalSize: number
}

export interface VideoConfig {
  videoExtensions: string[]
  ffmpegAvailable: boolean
}

export interface ProbeResult {
  nativelyPlayable: boolean
  container: string
  videoCodec: string
  audioCodec: string
  durationSeconds: number
  ffmpegAvailable: boolean
}
