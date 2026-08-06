import { http } from './api'

export interface SystemWorkspace {
  name: string
  path: string
  alias?: string | null
  displayName?: string
}

export interface SystemWorkspaceList {
  roots: Array<{
    root: string
    exists: boolean
    dirs: SystemWorkspace[]
  }>
  scannedAt: string
}

export interface SystemModule {
  name: string
  relPath: string
  absPath: string
  type: string
  summary?: string
  children?: SystemModule[]
  codePath?: string
  webPath?: string
}

export interface SystemModuleList {
  project: string
  projectPath: string
  exists: boolean
  projectType?: string
  projectTypeLabel?: string
  fromKnowledge?: boolean
  knowledgeBaseDir?: string
  knowledgeDirExists?: boolean
  modules: SystemModule[]
}

/** 获取平台统一维护的系统工作区清单。 */
export async function listSystemWorkspaces(): Promise<SystemWorkspaceList> {
  const response = await http<SystemWorkspaceList>('/claude-chat/workspaces')
  return {
    ...response,
    roots: response.roots.map(root => ({
      ...root,
      dirs: root.dirs.map(workspace => ({
        ...workspace,
        alias: workspace.alias ?? null,
        displayName: getSystemWorkspaceDisplayName(workspace),
      })),
    })),
  }
}

/** 兼容旧后端与旧查询缓存，统一回退到真实目录名。 */
export function getSystemWorkspaceDisplayName(workspace: SystemWorkspace) {
  return workspace.displayName?.trim() || workspace.alias?.trim() || workspace.name
}

/** 按项目绝对路径保存展示别名；空白别名表示清除。 */
export function saveSystemProjectAlias(projectPath: string, alias: string) {
  return http<void>('/claude-chat/workspaces/alias', {
    method: 'PUT',
    body: JSON.stringify({ projectPath, alias }),
  })
}

/** 按系统工作区路径获取模块清单。 */
export function listSystemModules(path: string) {
  return http<SystemModuleList>(`/claude-chat/workspaces/modules?path=${encodeURIComponent(path)}`)
}

/** 将历史逗号、中文逗号和顿号格式归一化为去重列表。 */
export function splitCatalogValues(value: string) {
  return Array.from(new Set(
    value.split(/[,，、]/).map(item => item.trim()).filter(Boolean),
  ))
}
