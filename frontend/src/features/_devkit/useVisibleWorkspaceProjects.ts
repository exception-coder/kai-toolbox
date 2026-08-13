import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SystemWorkspaceList } from '@/lib/systemCatalog'
import { getDevPreference } from './devPreferenceApi'
import {
  collectVisibleWorkspaceProjects,
  loadLocalIgnoredProjectPaths,
  PROJECT_WORKSPACE_PREFERENCE_ID,
  type ProjectWorkspaceVisibilityPreference,
} from './projectVisibility'

/** 统一读取项目工作台隐藏偏好，并生成开发工作台可选择的项目目录。 */
export function useVisibleWorkspaceProjects(workspaces: SystemWorkspaceList | undefined) {
  const localIgnoredProjects = useMemo(loadLocalIgnoredProjectPaths, [])
  const preferenceQuery = useQuery({
    queryKey: ['dev-preference', PROJECT_WORKSPACE_PREFERENCE_ID],
    queryFn: () => getDevPreference<ProjectWorkspaceVisibilityPreference>(PROJECT_WORKSPACE_PREFERENCE_ID),
    staleTime: 0,
  })
  const ignoredProjects = preferenceQuery.data?.ignoredProjects ?? localIgnoredProjects
  const projects = useMemo(() => {
    if (!workspaces || preferenceQuery.isPending) return []
    return collectVisibleWorkspaceProjects(workspaces, ignoredProjects)
  }, [ignoredProjects, preferenceQuery.isPending, workspaces])

  return {
    projects,
    ready: Boolean(workspaces) && !preferenceQuery.isPending,
  }
}
