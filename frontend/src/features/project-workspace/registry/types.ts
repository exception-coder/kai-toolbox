export type Readiness = 'UNINITIALIZED' | 'INITIALIZING' | 'AI_READY' | 'DEGRADED' | 'SYNC_REQUIRED' | 'FAILED'

export interface ProjectMetadata {
  name: string
  localPath: string
  repoType: string
  repoUrl: string
  defaultBranch: string
  devUrl: string
  testUrl: string
  owner: string
}

export interface RegistryProject {
  id: string
  metadata: ProjectMetadata
  state: Readiness
  profileVersion: number
  createdAt: number
  updatedAt: number
}

export interface ProfileAsset {
  kind: 'PROJECT' | 'CODE' | 'SEMANTIC' | 'EXECUTION' | 'VERIFICATION'
  title: string
  status: 'READY' | 'PARTIAL' | 'MISSING'
  sources: string[]
  facts: Record<string, string>
}

export interface SystemProfile {
  projectId: string
  version: number
  generatedAt: number
  fingerprint: string
  state: Readiness
  assets: ProfileAsset[]
  gaps: string[]
}

export interface InitRun {
  id: string
  projectId: string
  mode: string
  state: string
  stages: { id: string; title: string; state: string; message: string }[]
  message: string
  startedAt: number
  updatedAt: number
}

export interface SystemTask {
  id: string
  projectId: string
  profileVersion: number
  title: string
  description: string
  domainId: string | null
  context: string | null
  createdAt: number
}

export interface ProjectDetail {
  project: RegistryProject
  profile: SystemProfile | null
  runs: InitRun[]
  tasks: SystemTask[]
}

export const readinessLabels: Record<Readiness, string> = {
  UNINITIALIZED: '待初始化', INITIALIZING: '初始化中', AI_READY: 'AI Ready',
  DEGRADED: '待补齐证据', SYNC_REQUIRED: '需要同步', FAILED: '初始化失败',
}

export const emptyMetadata: ProjectMetadata = {
  name: '', localPath: '', repoType: 'git', repoUrl: '', defaultBranch: '', devUrl: '', testUrl: '', owner: '',
}
