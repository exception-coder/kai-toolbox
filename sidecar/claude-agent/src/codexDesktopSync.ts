import { callAppServer } from './codexAppServer.js'
import { resolve } from 'node:path'

export interface CodexProject {
  id: string; name: string; roots: string[]
}
export interface CodexThread {
  id: string; title: string; cwd: string; projectId: string | null
  model: string | null; reasoningEffort: string | null
  createdAt: number; updatedAt: number; source: string
}
export interface CodexDesktopPage {
  data: CodexProject[] | CodexThread[]; nextCursor: string | null
  project: CodexProject | null; fetchedAt: number
  projectMatch: 'native' | 'directory' | null
}
type Request = (method: string, params: Record<string, unknown>, home?: string) => Promise<Record<string, unknown>>
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Codex 返回了无效的目录数据')
  return value as Record<string, unknown>
}
const required = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Codex 返回的对象缺少原生身份或路径')
  return value
}
const optional = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null
const timestamp = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('Codex 返回了无效的更新时间')
  return value * 1000 // App Server uses Unix seconds; Forge metadata uses milliseconds.
}
const pathKey = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
function project(value: unknown): CodexProject {
  const row = object(value)
  if (!Array.isArray(row.roots)) throw new Error('Codex 项目缺少真实根目录')
  return { id: required(row.id), name: required(row.name), roots: row.roots.map(root => required(object(root).path)) }
}
function thread(value: unknown): CodexThread | null {
  const row = object(value)
  if (row.ephemeral === true) return null
  return {
    id: required(row.id), title: optional(row.name) ?? optional(row.preview)?.slice(0, 120) ?? 'Codex 会话',
    cwd: required(row.cwd), projectId: optional(row.projectId), model: optional(row.model),
    reasoningEffort: optional(row.reasoningEffort), createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt),
    source: optional(row.source) ?? 'unknown',
  }
}

/** Metadata only: never subscribes to a thread, resumes it, or starts a turn. */
export async function readCodexDesktopPage(
  home: string, kind: 'projects' | 'threads', cursor?: string, projectId?: string,
  request: Request = callAppServer,
): Promise<CodexDesktopPage> {
  if (!home.trim() || !['projects', 'threads'].includes(kind)) throw new Error('请选择 Codex 授权目录和查询类型')
  let directoryCursor: { cursor: string | null } | undefined
  if (projectId && cursor?.startsWith('forge-directory:')) {
    try {
      directoryCursor = JSON.parse(Buffer.from(cursor.slice('forge-directory:'.length), 'base64url').toString())
      if (!directoryCursor || (directoryCursor.cursor !== null && typeof directoryCursor.cursor !== 'string')) throw new Error('invalid cursor')
    } catch { throw new Error('无效的 Codex 项目分页游标，请刷新后重试') }
  }
  const params: Record<string, unknown> = { limit: 50, ...(cursor && !directoryCursor ? { cursor } : {}) }
  if (kind === 'threads') Object.assign(params, {
    sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'appServer'], archived: false,
    ...(projectId ? { projectId } : {}),
  })
  const result = directoryCursor ? { data: [], nextCursor: null }
    : await request(kind === 'projects' ? 'project/list' : 'thread/list', params, home)
  if (!Array.isArray(result.data) || result.data.length > 50) throw new Error('Codex 返回了无效的分页数据')
  if (result.nextCursor != null && typeof result.nextCursor !== 'string') throw new Error('Codex 返回了无效的分页游标')
  const selectedProject = kind === 'threads' && projectId
    ? project((await request('project/read', { projectId }, home)).project) : null
  if (selectedProject && selectedProject.id !== projectId) throw new Error('Codex 返回了其他项目，请刷新后重试')
  // Older desktop/CLI threads often have no projectId. Match exact native roots explicitly,
  // using a separate cursor stream and visible provenance, not inferred native membership.
  const directoryToken = (next: string | null) => 'forge-directory:' + Buffer.from(JSON.stringify({ cursor: next })).toString('base64url')
  if (selectedProject?.roots.length && (directoryCursor || (!result.data.length && result.nextCursor == null))) {
    const legacy = await request('thread/list', {
      limit: 50, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'appServer'], archived: false,
      projectId: null, cwd: selectedProject.roots,
      ...(directoryCursor?.cursor ? { cursor: directoryCursor.cursor } : {}),
    }, home)
    if (!Array.isArray(legacy.data) || legacy.data.length > 50 || (legacy.nextCursor != null && typeof legacy.nextCursor !== 'string')) {
      throw new Error('Codex 返回了无效的工作目录分页数据')
    }
    const rows = legacy.data.map(thread).filter((row): row is CodexThread => row !== null)
    if (rows.some(row => row.projectId !== null || !selectedProject.roots.some(root => pathKey(root) === pathKey(row.cwd)))) {
      throw new Error('Codex 未按请求的项目目录返回会话')
    }
    return { data: rows, project: selectedProject, projectMatch: 'directory', fetchedAt: Date.now(),
      nextCursor: optional(legacy.nextCursor) ? directoryToken(legacy.nextCursor as string) : null }
  }
  const rows = kind === 'projects' ? result.data.map(project) : result.data.map(thread).filter((row): row is CodexThread => row !== null)
  if (selectedProject && rows.some(row => (row as CodexThread).projectId !== selectedProject.id)) {
    throw new Error('Codex 未按请求的项目返回会话')
  }
  return {
    data: rows,
    project: selectedProject, projectMatch: selectedProject ? 'native' : null,
    nextCursor: optional(result.nextCursor) ?? (selectedProject?.roots.length && result.data.length ? directoryToken(null) : null), fetchedAt: Date.now(),
  }
}
