import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MultiSelectOption } from '@/components/ui/multi-select'
import { listSystemModules, listSystemWorkspaces, type SystemWorkspace } from '@/lib/systemCatalog'

/** 统一加载系统工作区及所选系统的模块候选。 */
export function useSystemModuleCatalog(selectedSystems: string[]) {
  const workspacesQuery = useQuery({
    queryKey: ['system-catalog', 'workspaces'],
    queryFn: listSystemWorkspaces,
  })

  const systems = useMemo(() => flattenSystems(workspacesQuery.data?.roots ?? []), [workspacesQuery.data])
  const selectedKey = useMemo(
    () => Array.from(new Set(selectedSystems)).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [selectedSystems],
  )
  const modulesQuery = useQuery({
    queryKey: ['system-catalog', 'modules', selectedKey],
    queryFn: () => Promise.all(selectedKey.map(async systemName => {
      const system = systems.find(item => item.name === systemName)
      if (!system) return { system: systemName, modules: [] as string[] }
      const response = await listSystemModules(system.path)
      return { system: systemName, modules: response.modules.map(item => item.name) }
    })),
    enabled: selectedKey.length > 0 && systems.length > 0,
  })

  const systemOptions: MultiSelectOption[] = systems.map(system => ({
    label: system.name,
    value: system.name,
  }))
  const moduleOptions: MultiSelectOption[] = (modulesQuery.data ?? []).flatMap(entry =>
    entry.modules.map(moduleName => ({
      label: moduleName,
      value: moduleName,
      group: selectedKey.length > 1 ? entry.system : undefined,
    })),
  )

  return {
    systems,
    systemOptions,
    moduleOptions,
    isLoading: workspacesQuery.isLoading || modulesQuery.isLoading,
    error: workspacesQuery.error ?? modulesQuery.error,
  }
}

function flattenSystems(roots: Array<{ exists: boolean; dirs: SystemWorkspace[] }>) {
  const systems = new Map<string, SystemWorkspace>()
  roots.filter(root => root.exists).forEach(root => {
    root.dirs.forEach(system => {
      if (!systems.has(system.name)) systems.set(system.name, system)
    })
  })
  return Array.from(systems.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}
