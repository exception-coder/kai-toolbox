import { getSystemWorkspaceDisplayName, type SystemWorkspaceList } from '@/lib/systemCatalog'

export const PROJECT_WORKSPACE_PREFERENCE_ID = 'project-workspace'
export const IGNORED_PROJECTS_STORAGE_KEY = 'kai-toolbox:project-workspace:ignored-projects'

export interface ProjectWorkspaceVisibilityPreference {
  ignoredProjects?: string[]
}

export interface VisibleWorkspaceProject {
  path: string
  label: string
}

/** Windows 路径按不区分大小写处理，同时兼容前后端不同的斜杠格式。 */
export function normalizeWorkspaceProjectPath(path: string) {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * 将已保存路径解析为当前工作区返回的规范路径；Windows 下忽略大小写和斜杠差异。
 * 只有原选择确实不可见或已不存在时才回退首项，避免格式差异误判后覆盖用户选择。
 */
export function resolveVisibleWorkspaceProjectPath(
  projects: VisibleWorkspaceProject[],
  preferredPath: string,
): string {
  const preferredKey = normalizeWorkspaceProjectPath(preferredPath)
  const matched = preferredKey
    ? projects.find(project => normalizeWorkspaceProjectPath(project.path) === preferredKey)
    : undefined
  return matched?.path ?? projects[0]?.path ?? ''
}

/** 服务端偏好不可用时读取项目工作台留下的本地备份。 */
export function loadLocalIgnoredProjectPaths(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(IGNORED_PROJECTS_STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : []
  } catch {
    return []
  }
}

/** 按项目工作台隐藏清单生成去重后的开发项目候选。 */
export function collectVisibleWorkspaceProjects(
  workspaces: SystemWorkspaceList,
  ignoredProjects: string[],
): VisibleWorkspaceProject[] {
  const ignoredPaths = new Set(ignoredProjects.map(normalizeWorkspaceProjectPath))
  const seen = new Set<string>()
  const projects: VisibleWorkspaceProject[] = []
  for (const root of workspaces.roots) {
    if (!root.exists) continue
    const rootName = root.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || root.root
    for (const project of root.dirs) {
      const pathKey = normalizeWorkspaceProjectPath(project.path)
      if (ignoredPaths.has(pathKey) || seen.has(pathKey)) continue
      seen.add(pathKey)
      projects.push({
        path: project.path,
        label: `${getSystemWorkspaceDisplayName(project)}（${rootName}）`,
      })
    }
  }
  return projects
}
