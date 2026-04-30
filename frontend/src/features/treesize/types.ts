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
}

export interface NodeView {
  path: string
  name: string
  dir: boolean
  size: number
  fileCount: number
  dirCount: number
  depth: number
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
