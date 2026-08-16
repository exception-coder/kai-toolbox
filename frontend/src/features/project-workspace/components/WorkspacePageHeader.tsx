import { AlertTriangle, Check, FolderTree, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProjectModules } from '@/features/claude-chat/public-api'
import { cn } from '@/lib/utils'
import { ProjectTypeBadge } from './WorkspaceSections'

const TEAM_KNOWLEDGE_DIR = '~/.kai-toolbox/team-tools/project-domain-knowledge/knowledge'

interface DependencyMarkProps {
  ok: boolean
  label?: string
}

function DependencyMark({ ok, label }: DependencyMarkProps) {
  return (
    <span
      className={cn(
        'ml-1 inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] font-medium',
        ok
          ? 'bg-[var(--color-success-soft)] text-[var(--color-success-soft-foreground)]'
          : 'bg-[var(--color-warning-soft)] text-[var(--color-warning-soft-foreground)]',
      )}
    >
      {ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label ?? (ok ? '已配置' : '未配置')}
    </span>
  )
}

interface WorkspacePageHeaderProps {
  selectedProjectPath?: string
  modulesLoading: boolean
  modules?: ProjectModules
  refreshing: boolean
  dependencies: {
    rootsOk: boolean
    knowledgeBaseOk: boolean
    domainOk: boolean
    domainLabel: string
    crossProjectOk: boolean
    crossProjectLabel: string
  }
  onRefresh: () => void
  onOpenWorkspaceConfig: () => void
}

export function WorkspacePageHeader({
  selectedProjectPath,
  modulesLoading,
  modules,
  refreshing,
  dependencies,
  onRefresh,
  onOpenWorkspaceConfig,
}: WorkspacePageHeaderProps) {
  return (
    <>
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <FolderTree className="h-4 w-4" />
            项目工作台
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-[var(--color-foreground)]">项目模块</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {selectedProjectPath ?? '读取配置工作区中'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedProjectPath ? <ProjectTypeBadge loading={modulesLoading} data={modules} /> : null}
          <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </header>

      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
          <Info className="h-3.5 w-3.5 shrink-0" />依赖声明
        </div>
        <ul className="ml-4 list-disc space-y-0.5">
          <li><b className="text-[var(--color-foreground)]">项目列表</b> ← <code>workspace.roots</code>（工作区扫描根目录）<DependencyMark ok={dependencies.rootsOk} /></li>
          <li><b className="text-[var(--color-foreground)]">模块清单 / 中文名</b> ← 团队初始化目录 <code>{TEAM_KNOWLEDGE_DIR}</code><DependencyMark ok={dependencies.knowledgeBaseOk} label={dependencies.knowledgeBaseOk ? '已就绪' : '未初始化'} /></li>
          <li><b className="text-[var(--color-foreground)]">业务真理识别</b> ← 团队初始化目录下的 <b className="text-[var(--color-foreground)]">project-domain-knowledge</b>（需已 build 引擎 dist）<DependencyMark ok={dependencies.domainOk} label={dependencies.domainLabel} /></li>
          <li><b className="text-[var(--color-foreground)]">跨项目拓扑识别</b> ← 团队初始化目录下的 <b className="text-[var(--color-foreground)]">cross-project-topology</b>（复用上面引擎）<DependencyMark ok={dependencies.crossProjectOk} label={dependencies.crossProjectLabel} /></li>
        </ul>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" className="font-medium text-[var(--color-primary)] hover:underline" onClick={onOpenWorkspaceConfig}>
            配置工作区目录 →
          </button>
        </div>
      </div>
    </>
  )
}
