import { AlertTriangle, Check, FolderGit2, FolderTree, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProjectModules } from '@/features/claude-chat/public-api'
import { cn } from '@/lib/utils'
import { ProjectTypeBadge } from './WorkspaceSections'

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
  projectDependencyCount: number
  projectDependenciesLoading: boolean
  dependencies: {
    rootsOk: boolean
  }
  onRefresh: () => void
  onOpenProjectDependencies: () => void
  onOpenWorkspaceConfig: () => void
}

export function WorkspacePageHeader({
  selectedProjectPath,
  modulesLoading,
  modules,
  refreshing,
  projectDependencyCount,
  projectDependenciesLoading,
  dependencies,
  onRefresh,
  onOpenProjectDependencies,
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
          <Button type="button" variant="outline" onClick={onOpenProjectDependencies} disabled={!selectedProjectPath || projectDependenciesLoading}>
            {projectDependenciesLoading ? <RefreshCw className="animate-spin" /> : <FolderGit2 />}
            依赖项目{projectDependencyCount > 0 ? ` · ${projectDependencyCount}` : ''}
          </Button>
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
          <li><b className="text-[var(--color-foreground)]">项目列表</b> ← 项目库工作区目录（工作区扫描根目录）<DependencyMark ok={dependencies.rootsOk} /></li>
          <li><b className="text-[var(--color-foreground)]">模块清单</b> ← 当前项目代码目录</li>
          <li><b className="text-[var(--color-foreground)]">业务知识</b> ← 项目现有文档与规格，通过项目文档入口维护</li>
          <li><b className="text-[var(--color-foreground)]">跨项目关系</b> ← 已授权关联项目的原文与定向源码</li>
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
