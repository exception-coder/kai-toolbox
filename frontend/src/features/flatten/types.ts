export type FlattenStatus =
  | 'SCANNING'   // 扫描 + 计算哈希中
  | 'SCANNED'    // 扫描完成，可处理重复
  | 'DEDUPING'   // 删除重复中
  | 'READY'      // 重复已处理（或跳过），可迁移
  | 'MOVING'     // 迁移中
  | 'COMPLETED'  // 全流程完成
  | 'FAILED'
  | 'CANCELLED'

export interface FlattenScan {
  id: string
  sourcePath: string
  targetPath: string
  status: FlattenStatus
  startedAt: number
  finishedAt: number | null
  totalFiles: number
  totalSize: number
  duplicateGroups: number
  duplicateFiles: number
  duplicateSize: number
  filesToMove: number
  movedFiles: number
  errorMsg: string | null
}

export interface FileItem {
  path: string
  name: string
  size: number
  hash: string
  modifiedAt: number
}

export interface DuplicateGroup {
  hash: string
  size: number
  files: FileItem[]
}

export interface MovePlanItem {
  sourcePath: string
  sourceName: string
  targetName: string
  size: number
  conflict: boolean
}

export interface ScanProgressEvent {
  scanned: number
  hashed: number
  totalSize: number
  currentPath: string
}

export interface ScanCompletedEvent {
  totalFiles: number
  totalSize: number
  duplicateGroups: number
  duplicateFiles: number
  duplicateSize: number
}

export interface MoveProgressEvent {
  moved: number
  total: number
  currentFile: string
}

export interface MoveCompletedEvent {
  movedFiles: number
}

export interface DedupeRequest {
  keepPaths: string[]
}

export interface DedupeResult {
  deleted: number
  freedSize: number
}
