import type { Engine, EngineCatalogView, WorkspaceList } from '../types'
import type { NewSessionPreferences } from './newSessionPreferences'
import { isKnownEngine } from './engineCatalog'

export function workspacePathKey(value: string): string {
  const path = value.trim().replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(path) || path.startsWith('//') ? path.toLowerCase() : path
}

export function workspaceName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

/** 新建入口只采用本次运行目录确认可用的引擎，不猜测离线目录的能力。 */
export function newSessionEngines(catalog?: EngineCatalogView): Engine[] {
  if (!catalog || catalog.error) return []
  return catalog.engines.filter(entry => isKnownEngine(entry.id) && entry.selectable && entry.probe.status === 'ready').map(entry => entry.id)
}

/** cwd 只能是当前工作区本身或它公开的可选项目，隐藏/删除项目不会降级到其他目录。 */
export function resolveNewSessionDirectory(root: WorkspaceList['roots'][number] | null, cwd: string) {
  if (!root) return { issue: '请选择工作区；没有工作区时可点击“新建”。', cwd: '', project: '' }
  if (!cwd || workspacePathKey(cwd) === workspacePathKey(root.root)) return { cwd: root.root, project: '' }
  const project = root.dirs.find(item => workspacePathKey(item.path) === workspacePathKey(cwd))
  return project ? { cwd: project.path, project: project.path }
    : { issue: '上次项目不在当前工作区的可选列表中，请重新选择项目，或选择“不选项目”。', cwd: '', project: '' }
}

export function validRecentSession(recent: NewSessionPreferences | undefined, roots: WorkspaceList['roots']) {
  if (!recent?.workspaceRoot) return null
  const root = roots.find(item => item.exists && workspacePathKey(item.root) === workspacePathKey(recent.workspaceRoot))
  if (!root) return null
  const directory = resolveNewSessionDirectory(root, recent.cwd)
  return directory.issue ? null : { ...recent, cwd: directory.cwd, workspaceRoot: root.root }
}
