import { useState } from 'react'
import { BotMessageSquare, ChevronDown, ChevronRight, Loader2, Pin, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClaudeChatSessionView, ProjectModule } from '@/features/claude-chat/public-api'
import { cn } from '@/lib/utils'
import { normalizePath } from '../lib/workspaceModel'

const INITIAL_MODULE_COUNT = 12
const FRONTEND_PREFIX = /^\.?\/?frontend\/src\/features\//

interface ModuleActions {
  sessionByCwd: Map<string, ClaudeChatSessionView>
  pendingPath: string | null
  onOpen: (module: ProjectModule) => void
  isPinned: (modulePath: string) => boolean
  onPin: (module: ProjectModule) => void
}

/** 模块目录的紧凑入口，展开状态仅属于当前项目视图。 */
export function WorkspaceModuleList({ modules, searchActive, ...actions }: ModuleActions & {
  modules: ProjectModule[]
  searchActive: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const frontendOnly = modules.length > 0 && modules.every(module => FRONTEND_PREFIX.test(module.relPath.replaceAll('\\', '/')))
  const limited = !searchActive && !expanded && modules.length > INITIAL_MODULE_COUNT
  const visible = limited ? modules.slice(0, INITIAL_MODULE_COUNT) : modules
  return (
    <section aria-label={frontendOnly ? '前端功能模块' : '项目模块'}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">{frontendOnly ? '前端功能模块' : '项目模块'} <span className="text-xs font-normal text-[var(--color-muted-foreground)]">{modules.length}</span></h3>
        {frontendOnly && <p className="text-xs text-[var(--color-muted-foreground)]">按前端功能目录展示，不代表完整业务域或后端模块。</p>}
      </div>
      <div className="grid items-start gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((module, index) => <ModuleRow key={`${module.relPath}|${module.name}|${index}`} module={module} {...actions} />)}
      </div>
      {!searchActive && modules.length > INITIAL_MODULE_COUNT && <Button type="button" variant="ghost" size="sm"
        className="mt-2 text-xs" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <ChevronDown className={cn('size-3.5', expanded && 'rotate-180')} />
        {expanded ? '收起模块' : `展开其余 ${modules.length - INITIAL_MODULE_COUNT} 项`}
      </Button>}
    </section>
  )
}

function ModuleRow({ module, depth = 0, ...actions }: ModuleActions & { module: ProjectModule; depth?: number }) {
  const [expanded, setExpanded] = useState(false)
  const children = module.children ?? []
  const session = actions.sessionByCwd.get(normalizePath(module.absPath))
  const pinned = actions.isPinned(module.absPath)
  const opening = actions.pendingPath === module.absPath
  const openLabel = `${session ? '打开会话' : '新建会话'}：${module.name}`
  const pinLabel = `${pinned ? '取消钉选' : '钉选'}：${module.name}`
  const path = module.relPath.replaceAll('\\', '/').replace(FRONTEND_PREFIX, '')
  return (
    <div className="min-w-0">
      <div className="flex min-h-14 min-w-0 items-center gap-2 border-b border-[var(--color-border)] py-2"
        style={depth ? { paddingLeft: Math.min(depth, 3) * 8 } : undefined}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={module.summary ? `${module.name} — ${module.summary}` : module.name}>{module.name}</div>
          <div className="truncate text-xs text-[var(--color-muted-foreground)]" title={module.relPath}>
            {path}{module.type !== 'knowledge' && <span> · {module.type}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {children.length > 0 && <Button type="button" variant="ghost" size="sm" className="h-8 gap-0.5 px-1 text-xs"
            aria-label={`${expanded ? '收起' : '展开'}子模块：${module.name}（${children.length}）`} aria-expanded={expanded}
            title={`${children.length} 个子模块`} onClick={() => setExpanded(value => !value)}>
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{children.length}
          </Button>}
          <Button type="button" variant={pinned ? 'secondary' : 'ghost'} size="icon" className="size-8"
            aria-label={pinLabel} aria-pressed={pinned} title={pinLabel} onClick={() => actions.onPin(module)}>
            <Pin className={cn('size-3.5', pinned && 'fill-current')} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={openLabel} title={openLabel}
            disabled={opening} onClick={() => actions.onOpen(module)}>
            {opening ? <Loader2 className="size-4 animate-spin" /> : session ? <BotMessageSquare className="size-4 text-[var(--color-primary)]" /> : <Play className="size-4" />}
          </Button>
        </div>
      </div>
      {expanded && children.map((child, index) => <ModuleRow key={`${child.relPath}|${child.name}|${index}`}
        module={child} depth={depth + 1} {...actions} />)}
    </div>
  )
}
