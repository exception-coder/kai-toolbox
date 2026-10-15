import { useQuery } from '@tanstack/react-query'
import { Warehouse } from 'lucide-react'
import { listWorkspaces } from '@/features/claude-chat/public-api'
import {
  DevServiceSection,
  DatabaseResourceNotice,
  useDevWorkbenchPreference,
  useVisibleWorkspaceProjects,
} from '@/features/_devkit/public-api'

/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:scm-dev:cwd'
/** 记住上次填的模块与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:scm-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:scm-dev:requirement'

export function ScmDevPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  const { projects: dirs, ready: dirsReady } = useVisibleWorkspaceProjects(workspaces)

  const devPreference = useDevWorkbenchPreference('scm-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference

  return (
    <div className={embedded ? "min-w-0" : "mx-auto max-w-2xl p-4 sm:p-6"}>
      <div className="mb-4 flex items-center gap-2">
        {!embedded && <><Warehouse className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">SCM需求开发</h1></>}
      </div>
      <DevServiceSection
        serviceId="scm"
        dirs={dirs}
        dirsReady={dirsReady}
        defaultCwd={cwd}
        preference={devPreference.preference.services.scm}
        onPreferenceChange={(value, immediate) => devPreference.setService('scm', value, immediate)}
        defaultCommand="powershell -NoProfile -ExecutionPolicy Bypass -File .\\SCM\\start-scm.ps1 -Foreground -FrontendPath 'D:\\Users\\zhang\\myWork\\scm-system\\scm-front-end'"
        stopCommand="powershell -NoProfile -ExecutionPolicy Bypass -File .\\SCM\\stop-scm.ps1"
        commandPlaceholder="首次或改过公共模块加 -Build：… start-scm.ps1 -Foreground -Build"
        title="SCM 服务启停 + 启动日志"
        readinessPorts={[
          { label: 'backend', port: 8085 },
          { label: 'frontend', port: 9528 },
        ]}
      />
      <DatabaseResourceNotice />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        启停用 start-scm.ps1 -Foreground（前台合并模式）：后端/前端日志按 [backend]/[frontend] 前缀合并到本区，停服对进程树整体清理。
      </p>
    </div>
  )
}
