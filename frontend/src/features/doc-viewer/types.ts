export interface SourceDTO {
  id: string
  owner: string
  repo: string
  ref: string
  subPath: string
  alias: string
  hasPat: boolean
  treeETag: string | null
  rateLimitUntil: number | null
  lastRefreshedAt: number
  createdAt: number
}

export interface CreateSourceRequest {
  url: string
  pat?: string | null
  alias?: string | null
}

export type TreeNodeKind = 'BLOB' | 'TREE' | 'BINARY'

export interface TreeNodeDTO {
  path: string
  name: string
  kind: TreeNodeKind
  sha: string
  size: number | null
  parentPath: string
  depth: number
}

export interface TreeResponseDTO {
  sourceId: string
  ref: string
  refSha: string
  rateLimited: boolean
  nodes: TreeNodeDTO[]
}

export interface FileDTO {
  sourceId: string
  path: string
  sha: string
  kind: 'BLOB' | 'BINARY'
  size: number
  /** BINARY 时为 null；不因 size 截断 */
  content: string | null
  rawBaseUrl: string
}

export interface RefreshOutcomeDTO {
  id: string
  outcome: 'NOT_MODIFIED' | 'UPDATED' | 'RATE_LIMITED' | 'COOLDOWN'
  treeETag: string | null
  lastRefreshedAt: number
  rateLimitUntil: number | null
  rateLimited: boolean
}

export interface NestedTreeNode extends TreeNodeDTO {
  children: NestedTreeNode[]
}

// === 本地目录源 ===

export interface LocalSourceDTO {
  id: string
  alias: string
  rootPath: string
  lastVisitedAt: number
  createdAt: number
}

export interface CreateLocalSourceRequest {
  rootPath: string
  alias?: string | null
}

export interface LocalTreeResponseDTO {
  sourceId: string
  rootPath: string
  nodes: TreeNodeDTO[]
}

export interface LocalFileDTO {
  sourceId: string
  path: string
  kind: 'BLOB' | 'BINARY'
  size: number
  content: string | null
  lastModified: number
}

export interface SaveLocalFileRequest {
  path: string
  content: string
  expectedLastModified: number
}

export interface SaveLocalFileResponse {
  sourceId: string
  path: string
  size: number
  lastModified: number
}
