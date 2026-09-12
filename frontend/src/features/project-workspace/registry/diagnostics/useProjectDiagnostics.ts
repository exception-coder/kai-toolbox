import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { inspectSystemRoute, listProjectRouteBindings, listSystemRouteCandidates } from './api'
import { matchingProject, sameSourcePath, type DiagnosticProject } from './projectContext'

/** 检测结果按项目、输入和绑定隔离，切换上下文时不会展示上一次项目的结果。 */
export function useProjectDiagnostics(scope?: DiagnosticProject) {
  const [params] = useSearchParams()
  const candidates = useQuery({ queryKey: ['system-route-candidates'], queryFn: listSystemRouteCandidates })
  const bindings = useQuery({ queryKey: ['project-route-bindings'], queryFn: listProjectRouteBindings })
  const [selection, setSelection] = useState<string | null>(null)
  const project = selection ?? (scope ? matchingProject(candidates.data ?? [], scope) : params.get('project') ?? '')
  const [module, setModule] = useState(params.get('module') ?? '')
  const [url, setUrl] = useState(params.get('url') ?? '')
  const binding = bindings.data?.find(item => item.projectKey === project)
  const sourcePath = binding?.projectPath ?? candidates.data?.find(item => item.projectKey === project)?.projectPath ?? ''
  const mismatched = Boolean(scope && project && !sameSourcePath(sourcePath, scope.path))
  const inspection = useQuery({
    queryKey: ['system-route-inspection', project, module, url, sourcePath],
    queryFn: () => inspectSystemRoute({ project, module, url }),
    enabled: false,
    retry: false,
  })
  return { candidates, bindings, project, setSelection, module, setModule, url, setUrl, binding, mismatched, inspection }
}
