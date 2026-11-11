import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getDevPreference,
  loadLocalIgnoredProjectPaths,
  normalizeWorkspaceProjectPath,
  PROJECT_WORKSPACE_PREFERENCE_ID,
  type ProjectWorkspaceVisibilityPreference,
} from '@/features/_devkit/public-api'
import { listWorkspaces } from '../api'
import type { Engine } from '../types'
import type { ProviderProfile } from '../providerProfiles'
import type { useNewSessionPreferences } from './useNewSessionPreferences'
import { newSessionSelectionIssue, resolveNewSessionWorkspace, type NewSessionPreferences } from '../lib/newSessionPreferences'
import { resolveNewSessionDirectory, validRecentSession, workspacePathKey } from '../lib/newSessionWorkspace'

interface Options {
  userId: number | undefined
  preferences: ReturnType<typeof useNewSessionPreferences>
  cwd: string
  engines: Engine[]
  enginesLoading: boolean
  providers: ProviderProfile[]
  providersLoading: boolean
  providersFailed: boolean
}

/**
 * 新建会话的工作区与项目选择：预取并定时刷新工作区，过滤隐藏项目，解析当前目录并校验上次选择。
 * 从 ChatPage 拆出，行为与原实现一致。
 */
export function useNewSessionWorkspaces({ userId, preferences, cwd, engines, enginesLoading, providers, providersLoading, providersFailed }: Options) {
  // 页面加载即预取工作区并定时刷新，打开新建面板直接用缓存；失败时保留选择并提供刷新或工作区设置入口。
  const workspacesQuery = useQuery({
    queryKey: ['claude-chat-workspaces', userId ?? 'local'],
    queryFn: listWorkspaces,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
  const workspaces = workspacesQuery.data
  const { data: projectWorkspacePreference, isPending: projectVisibilityLoading } = useQuery({
    queryKey: ['dev-preference', PROJECT_WORKSPACE_PREFERENCE_ID],
    queryFn: () => getDevPreference<ProjectWorkspaceVisibilityPreference>(PROJECT_WORKSPACE_PREFERENCE_ID),
    staleTime: 0,
  })
  // 两级工作目录：先选工作区 root，再列该 root 下的一级目录（只显示名字）。
  const wsRoots = workspaces?.roots.filter(r => r.exists) ?? []
  const activeRoot = resolveNewSessionWorkspace(wsRoots, preferences.choice.workspaceRoot)
  const selectNewSessionPreference = (change: Partial<NewSessionPreferences>) => preferences.select({
    workspaceRoot: activeRoot?.root ?? preferences.choice.workspaceRoot, ...change,
  })
  const hiddenProjectPaths = useMemo(() => new Set(
    (projectWorkspacePreference?.ignoredProjects ?? loadLocalIgnoredProjectPaths())
      .map(normalizeWorkspaceProjectPath),
  ), [projectWorkspacePreference])
  const visibleNewRoots = wsRoots.map(root => ({ ...root, dirs: root.dirs.filter(dir => !hiddenProjectPaths.has(normalizeWorkspaceProjectPath(dir.path))) }))
  const visibleNewRoot = visibleNewRoots.find(root => workspacePathKey(root.root) === workspacePathKey(activeRoot?.root ?? '')) ?? null
  const newSessionDirectory = resolveNewSessionDirectory(visibleNewRoot, cwd)
  const newSessionEvidence = { engines, enginesLoading, providers, providersLoading, providersFailed }
  const newSessionWorkspacesLoading = workspacesQuery.isPending || projectVisibilityLoading
  const newSessionIssue = workspacesQuery.isError ? '工作区读取失败，请刷新可用配置。'
    : newSessionDirectory.issue ?? newSessionSelectionIssue(preferences.choice, newSessionEvidence)
  const recentNewSession = validRecentSession(preferences.recent, visibleNewRoots)
  const recentNewSessionIssue = workspacesQuery.isError ? '工作区读取失败，请刷新。'
    : recentNewSession ? newSessionSelectionIssue(recentNewSession, newSessionEvidence) : undefined
  return {
    workspacesQuery, selectNewSessionPreference, visibleNewRoots, visibleNewRoot, newSessionDirectory, newSessionEvidence,
    newSessionWorkspacesLoading, newSessionIssue, recentNewSession, recentNewSessionIssue,
  }
}
