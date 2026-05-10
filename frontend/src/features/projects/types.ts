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
