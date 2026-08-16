import type { ProjectModule } from '@/features/claude-chat/public-api'
import type { AggregationItem } from '../hooks/useAggregationCart'

/** Build the draft used to start a cross-project collaboration session. */
export function buildLinkagePrompt(items: AggregationItem[]): string {
  const byProject = new Map<string, AggregationItem[]>()
  for (const item of items) {
    const projectItems = byProject.get(item.projectName) ?? []
    projectItems.push(item)
    byProject.set(item.projectName, projectItems)
  }

  const lines = [
    '我把以下多个项目的模块聚合到了同一个工作区，需要联动开发。各项目已软链到当前目录下（以项目名为子目录）：',
    '',
  ]
  for (const [projectName, projectItems] of byProject) {
    lines.push(`- **${projectName}/**`)
    for (const item of projectItems) {
      lines.push(`  - ${item.moduleName}: \`${projectName}/${item.moduleRelPath}\``)
    }
  }
  lines.push('', '请先阅读上述模块、理清它们之间的联动关系，再告诉我你的改造方案。')
  return lines.join('\n')
}

/** Keep matching branches while preserving the original module hierarchy. */
export function filterModuleTree(modules: ProjectModule[], query: string): ProjectModule[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return modules

  const matches = (module: ProjectModule) =>
    module.name.toLowerCase().includes(normalizedQuery)
    || module.relPath.toLowerCase().includes(normalizedQuery)
    || module.type.toLowerCase().includes(normalizedQuery)
    || (module.summary ?? '').toLowerCase().includes(normalizedQuery)

  const result: ProjectModule[] = []
  for (const module of modules) {
    if (matches(module)) {
      result.push(module)
      continue
    }
    const matchingChildren = filterModuleTree(module.children ?? [], normalizedQuery)
    if (matchingChildren.length > 0) result.push({ ...module, children: matchingChildren })
  }
  return result
}

export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}
