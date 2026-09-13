import { useQuery } from '@tanstack/react-query'
import { listRegistry } from '../registry/api'
import { RegistryError } from '../registry/RegistryStates'
import { SystemDomainsPanel } from '../registry/SystemDomainsPanel'

const directoryKey = (path: string) => {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized
}

/** 从统一登记表解析系统身份，不按项目名称或知识目录推测绑定。 */
export function ProjectKnowledgeEntry({ projectPath }: { projectPath: string }) {
  const query = useQuery({ queryKey: ['project-registry'], queryFn: listRegistry })
  const project = query.data?.find(item => directoryKey(item.metadata.localPath) === directoryKey(projectPath))
  if (query.isLoading) return <p role="status" className="text-sm">正在读取项目登记信息…</p>
  if (query.error) return <RegistryError error={query.error} retry={() => void query.refetch()} />
  if (!project) return <p className="text-sm leading-6">此目录尚未接入项目库，登记后可统一探索并关联其它项目。<a href="/tools/project-workspace?section=local" className="ml-2 underline underline-offset-4">接入项目库</a></p>
  return <SystemDomainsPanel projectId={project.id} />
}
