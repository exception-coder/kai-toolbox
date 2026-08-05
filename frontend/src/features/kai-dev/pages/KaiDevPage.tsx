import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Hammer } from 'lucide-react'
import { listWorkspaces } from '@/features/claude-chat/api'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'
import { useDevWorkbenchPreference } from '@/features/_devkit/useDevWorkbenchPreference'

const CWD_KEY = 'kai-toolbox:kai-dev:cwd'
const MODULE_KEY = 'kai-toolbox:kai-dev:module'
const REQ_KEY = 'kai-toolbox:kai-dev:requirement'

export function KaiDevPage() {
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  const dirs = useMemo(() => {
    const out: { path: string; label: string }[] = []
    for (const r of workspaces?.roots ?? []) {
      if (!r.exists) continue
      const rootName = r.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || r.root
      for (const d of r.dirs) out.push({ path: d.path, label: `${d.name}（${rootName}）` })
    }
    return out
  }, [workspaces])

  const devPreference = useDevWorkbenchPreference('kai-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQ_KEY,
  })
  const { cwd } = devPreference.preference

  const pickCwd = (p: string) => devPreference.setField('cwd', p)

  useEffect(() => {
    if (!devPreference.hydrated || dirs.length === 0) return
    if (!dirs.some(d => d.path === cwd)) pickCwd(dirs[0].path)
  }, [devPreference.hydrated, dirs, cwd])

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Hammer className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">Forge 开发</h1>
      </div>
      <DevServiceSection
        serviceId="kai-backend"
        dirs={dirs}
        defaultCwd={cwd}
        preference={devPreference.preference.services['kai-backend']}
        onPreferenceChange={(value, immediate) => devPreference.setService('kai-backend', value, immediate)}
        defaultCommand="mvn -pl toolbox-starter -am spring-boot:run"
        title="后端服务启停 + 启动日志"
      />
      <DevServiceSection
        serviceId="kai-frontend"
        dirs={dirs}
        defaultCwd={cwd}
        preference={devPreference.preference.services['kai-frontend']}
        onPreferenceChange={(value, immediate) => devPreference.setService('kai-frontend', value, immediate)}
        defaultCommand="cd frontend; npm run dev"
        title="前端 Dev 服务启停 + 日志"
      />
    </div>
  )
}
