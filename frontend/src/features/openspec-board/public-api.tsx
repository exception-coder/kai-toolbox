import { lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { usePermission } from '@/shell/permission'
export { getOpenSpecBoards } from './api'
export type { OpenSpecProjectSummary } from './types'

const Board = lazy(() => import('./pages/OpenSpecBoardPage').then(module => ({ default: module.OpenSpecBoardPage })))

export function ApplicationTaskBoard({ projectId }: { projectId?: string }) {
  const allowed = usePermission('menu:openspec-board')
  if (!allowed) return <p className="py-6 text-sm text-muted-foreground">需要需求与任务查看权限，请联系管理员。</p>
  return <Suspense fallback={<p role="status">正在读取需求与任务…</p>}><Board key={projectId ?? 'all'} scopedProjectId={projectId} embedded /></Suspense>
}

export function LegacyOpenSpecRedirect() {
  const location = useLocation()
  return <Navigate replace to={`/tools/reqpool/changes${location.search}${location.hash}`} />
}
