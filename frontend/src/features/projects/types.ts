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

export interface CommitInfo {
  hash: string
  shortHash: string
  author: string
  /** ISO-8601 提交时间 */
  date: string
  subject: string
}

export interface CommitsResponse {
  commits: CommitInfo[]
}

export interface CommitDiff {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
  /** git show --stat --patch 原文 */
  diff: string
  /** 超上限被截断 */
  truncated: boolean
}
