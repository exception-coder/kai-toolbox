export type ProjectType =
  | 'flutter'
  | 'maven'
  | 'gradle'
  | 'node'
  | 'python'
  | 'git'
  | 'other'

export interface ProjectInfo {
  name: string
  path: string
  type: ProjectType
  branch: string | null
  lastModified: string
}

export interface ProjectsListResponse {
  root: string
  rootExists: boolean
  scannedAt: string
  items: ProjectInfo[]
}

// git 提交/diff 类型已移到通用 @/components/git/types（projects 与 claude-chat 共用）
