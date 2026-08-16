import { AlertTriangle, Check, ChevronDown, ChevronRight, Database, EyeOff, FolderTree, Loader2, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { WorkspaceDir } from '@/features/claude-chat/public-api'
import type { useIgnoredProjects } from '../hooks/useIgnoredProjects'
import type { useStatusCache } from '../hooks/useStatusCache'
import { errorMessage } from '../lib/workspaceModel'
import { KnowledgeGraphFilterBar, ProjectButton, StateLine } from './WorkspaceSections'

export type WorkspaceProject = WorkspaceDir & { root: string }

type StatusCache = ReturnType<typeof useStatusCache>
type IgnoredProjects = ReturnType<typeof useIgnoredProjects>

interface WorkspaceProjectSidebarProps {
  source: {
    roots: { root: string; exists: boolean }[]
    loading: boolean
    error: unknown
    projects: WorkspaceProject[]
    visibleProjects: WorkspaceProject[]
    activeProjects: WorkspaceProject[]
    ignoredProjects: WorkspaceProject[]
  }
  selection: {
    selectedPath: string
    keyword: string
    ignoredOpen: boolean
  }
  alias: {
    editingPath: string
    draft: string
    saving: boolean
    error: unknown
  }
  statusCache: StatusCache
  ignored: IgnoredProjects
  onKeywordChange: (value: string) => void
  onIgnoredOpenChange: (open: boolean) => void
  onOpenWorkspaceConfig: () => void
  onShowChanges: (project: WorkspaceProject) => void
  onEditAlias: (project: WorkspaceProject) => void
  onAliasDraftChange: (value: string) => void
  onCancelAlias: () => void
  onSaveAlias: (project: WorkspaceProject) => void
  onSelectProject: (project: WorkspaceProject) => void
}

export function WorkspaceProjectSidebar({
  source,
  selection,
  alias,
  statusCache,
  ignored,
  onKeywordChange,
  onIgnoredOpenChange,
  onOpenWorkspaceConfig,
  onShowChanges,
  onEditAlias,
  onAliasDraftChange,
  onCancelAlias,
  onSaveAlias,
  onSelectProject,
}: WorkspaceProjectSidebarProps) {
  const renderProject = (project: WorkspaceProject, hidden: boolean) => (
    <ProjectButton
      key={project.path}
      project={project}
      selected={project.path === selection.selectedPath}
      snapshot={statusCache.snapshotOf(project.path)}
      ignored={hidden}
      editing={alias.editingPath === project.path}
      aliasDraft={alias.draft}
      aliasSaving={alias.saving && alias.editingPath === project.path}
      aliasError={alias.error && alias.editingPath === project.path ? errorMessage(alias.error) : ''}
      onToggleIgnore={() => ignored.toggle(project.path)}
      onShowChanges={() => onShowChanges(project)}
      onEditAlias={() => onEditAlias(project)}
      onAliasDraftChange={onAliasDraftChange}
      onCancelAlias={onCancelAlias}
      onSaveAlias={() => onSaveAlias(project)}
      onClick={() => onSelectProject(project)}
    />
  )

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderTree className="h-4 w-4" />
          项目
        </CardTitle>
        <CardDescription>来自 Vibe Coding 工作区配置（workspace.roots）</CardDescription>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
          <Input
            className="pl-9"
            value={selection.keyword}
            onChange={event => onKeywordChange(event.target.value)}
            placeholder="搜索项目名称 / 路径"
          />
        </div>
        <KnowledgeGraphFilterBar
          kg={statusCache}
          ignored={ignored}
          onRefreshAll={() => statusCache.refresh(source.projects.filter(project => !ignored.isIgnored(project.path)).map(project => project.path))}
        />
        {source.roots.length > 0 && (
          <div className="mt-1.5 space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">当前扫描目录</div>
            {source.roots.map(root => (
              <div key={root.root} className="flex items-center gap-1.5 text-[11px]" title={root.root}>
                {root.exists
                  ? <Check className="h-3 w-3 shrink-0 text-[var(--color-success-soft-foreground,#16a34a)]" />
                  : <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--color-warning,#b45309)]" />}
                <code className="truncate text-[var(--color-foreground)]">{root.root || '(空)'}</code>
                {!root.exists && <span className="shrink-0 text-[var(--color-warning,#b45309)]">不存在</span>}
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {source.loading ? (
          <StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="正在读取项目" />
        ) : source.error ? (
          <StateLine tone="danger" text={errorMessage(source.error)} />
        ) : source.projects.length === 0 ? (
          <div className="space-y-2 rounded-md border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted-foreground)]">
            <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-foreground)]">
              <AlertTriangle className="h-4 w-4 text-[var(--color-warning,#b45309)]" />
              没有可用项目
            </div>
            <p>
              项目列表来自配置项 <code>toolbox.claude-chat.workspace.roots</code>（工作区扫描根目录）。
              当前它{source.roots.length > 0 ? '下没有扫描到子目录——检查路径是否存在/写对' : '还未配置'}。
            </p>
            <p>去「配置中心 → Claude 工作目录」把你的代码目录（如 <code>D:\Users\你\myWork</code>）加进 roots，保存即时生效、无需重启。</p>
            <Button type="button" size="sm" variant="outline" onClick={onOpenWorkspaceConfig}>
              <Database className="h-3.5 w-3.5" />去配置工作区目录
            </Button>
          </div>
        ) : source.visibleProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
            <span>没有项目匹配当前搜索或筛选条件</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onKeywordChange('')
                statusCache.setGraphifyFilter('ALL')
                statusCache.setBusinessFilter('ALL')
                ignored.setFilter('ALL')
              }}
            >
              清除筛选
            </Button>
          </div>
        ) : (
          <>
            {source.activeProjects.map(project => renderProject(project, false))}
            {source.ignoredProjects.length > 0 && (
              <div className="rounded-md border border-dashed border-[var(--color-border)]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                  onClick={() => onIgnoredOpenChange(!selection.ignoredOpen)}
                  aria-expanded={selection.ignoredOpen}
                >
                  <span className="flex items-center gap-1.5">
                    {selection.ignoredOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <EyeOff className="h-3.5 w-3.5" />
                    已隐藏项目
                  </span>
                  <Badge variant="secondary">{source.ignoredProjects.length}</Badge>
                </button>
                {selection.ignoredOpen && (
                  <div className="space-y-2 border-t border-[var(--color-border)] p-2">
                    {source.ignoredProjects.map(project => renderProject(project, true))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
