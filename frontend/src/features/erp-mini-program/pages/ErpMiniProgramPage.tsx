import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Smartphone } from 'lucide-react'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'
import { useDevWorkbenchPreference } from '@/features/_devkit/useDevWorkbenchPreference'
import { listWorkspaces } from '@/features/claude-chat/api'
import { getSystemWorkspaceDisplayName } from '@/lib/systemCatalog'

const WORKBENCH_ID = 'erp-mini-program'
const SERVICE_ID = 'erp-mini-program'
const CWD_KEY = 'kai-toolbox:erp-mini-program:cwd'
const MODULE_KEY = 'kai-toolbox:erp-mini-program:module'
const REQUIREMENT_KEY = 'kai-toolbox:erp-mini-program:requirement'

/** ERP 小程序需求工作台，负责开发者工具启停与日志查看。 */
export function ErpMiniProgramPage() {
  const { data: workspaces } = useQuery({
    queryKey: ['claude-chat-workspaces'],
    queryFn: listWorkspaces,
    staleTime: 5000,
  })
  const dirs = useMemo(() => {
    const options: { path: string; label: string }[] = []
    for (const root of workspaces?.roots ?? []) {
      if (!root.exists) continue
      const rootName = root.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || root.root
      for (const dir of root.dirs) {
        options.push({ path: dir.path, label: `${getSystemWorkspaceDisplayName(dir)}（${rootName}）` })
      }
    }
    return options
  }, [workspaces])
  const devPreference = useDevWorkbenchPreference(WORKBENCH_ID, {
    cwd: CWD_KEY,
    module: MODULE_KEY,
    requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference

  useEffect(() => {
    if (!devPreference.hydrated || dirs.length === 0) return
    if (dirs.some((dir) => dir.path === cwd)) return
    const frontendDir = dirs.find((dir) => /[\\/]frontend$/i.test(dir.path))
    devPreference.setField('cwd', frontendDir?.path ?? dirs[0].path)
  }, [cwd, devPreference, dirs])

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">ERP小程序需求开发</h1>
      </div>

      <DevServiceSection
        serviceId={SERVICE_ID}
        dirs={dirs}
        defaultCwd={cwd}
        preference={devPreference.preference.services[SERVICE_ID]}
        onPreferenceChange={(value, immediate) => devPreference.setService(SERVICE_ID, value, immediate)}
        defaultCommand=".\start-erp-mini-program.ps1"
        stopCommand=".\stop-erp-mini-program.ps1"
        title="ERP小程序启停 + 启动日志"
      />
    </div>
  )
}
