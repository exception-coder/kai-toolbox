import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Database, FolderGit2, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  ProjectDependency,
  ProjectDependencyInput,
  ProjectDependencyRelation,
  WorkspaceDir,
} from '@/features/claude-chat/public-api'
import { getSystemWorkspaceDisplayName } from '@/lib/systemCatalog'
import { cn } from '@/lib/utils'

const MAX_DEPENDENCY_COUNT = 8

interface ProjectDependenciesDialogProps {
  primaryProject: WorkspaceDir
  projects: WorkspaceDir[]
  dependencies: ProjectDependency[]
  loading: boolean
  saving: boolean
  loadError?: string | null
  saveError?: string | null
  onRetry: () => void
  onSave: (dependencies: ProjectDependencyInput[]) => void
  onClose: () => void
}

/** 为项目配置长期依赖；只保存引用，不复制依赖项目的知识图谱。 */
export function ProjectDependenciesDialog({
  primaryProject,
  projects,
  dependencies,
  loading,
  saving,
  loadError,
  saveError,
  onRetry,
  onSave,
  onClose,
}: ProjectDependenciesDialogProps) {
  const [selected, setSelected] = useState<Record<string, ProjectDependencyRelation>>({})
  const [search, setSearch] = useState('')
  const [selectionError, setSelectionError] = useState<string | null>(null)

  useEffect(() => {
    const availablePaths = new Set(projects.map(project => project.path))
    setSelected(Object.fromEntries(dependencies
      .filter(dependency => availablePaths.has(dependency.projectPath))
      .map(dependency => [dependency.projectPath, dependency.relation ?? 'DEPENDS_ON'])))
  }, [dependencies, projects])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase()
    return projects
      .filter(project => project.path !== primaryProject.path)
      .filter(project => !query || `${getSystemWorkspaceDisplayName(project)} ${project.name} ${project.path}`
        .toLowerCase().includes(query))
  }, [primaryProject.path, projects, search])
  const dependencyByPath = useMemo(
    () => new Map(dependencies.map(dependency => [dependency.projectPath, dependency])),
    [dependencies],
  )
  const projectPaths = useMemo(() => new Set(projects.map(project => project.path)), [projects])
  const unavailableDependencies = dependencies.filter(dependency => !projectPaths.has(dependency.projectPath))

  function toggle(path: string) {
    setSelectionError(null)
    setSelected(current => {
      if (current[path]) {
        const next = { ...current }
        delete next[path]
        return next
      }
      if (Object.keys(current).length >= MAX_DEPENDENCY_COUNT) {
        setSelectionError(`每个项目最多关联 ${MAX_DEPENDENCY_COUNT} 个依赖项目`)
        return current
      }
      return { ...current, [path]: 'DEPENDS_ON' }
    })
  }

  function setRelation(path: string, relation: ProjectDependencyRelation) {
    setSelected(current => ({ ...current, [path]: relation }))
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-3"
      onMouseDown={event => event.target === event.currentTarget && !saving && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dependencies-title"
        className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-muted)] text-[var(--color-foreground)]">
            <FolderGit2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="project-dependencies-title" className="text-sm font-semibold text-[var(--color-foreground)]">关联项目与证据范围</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
              关系决定探索从哪些项目查询业务知识、代码图谱、DDL、路由与源码。只保存引用，不复制知识。
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} disabled={saving} aria-label="关闭">
            <X className="size-4" />
          </Button>
        </header>

        <div className="border-b border-[var(--color-border)] px-5 py-3">
          <div className="text-xs text-[var(--color-muted-foreground)]">
            主项目 <span className="ml-1 font-medium text-[var(--color-foreground)]">{getSystemWorkspaceDisplayName(primaryProject)}</span>
            <span className="ml-2 break-all font-mono text-[10px]">{primaryProject.path}</span>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索项目名称或目录" className="pl-9" autoFocus />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="grid min-h-44 place-items-center text-xs text-[var(--color-muted-foreground)]">
              <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />正在读取依赖关系</span>
            </div>
          ) : loadError ? (
            <div className="grid min-h-44 place-items-center text-center">
              <div>
                <AlertTriangle className="mx-auto size-5 text-[var(--color-destructive)]" />
                <p className="mt-2 text-sm text-[var(--color-foreground)]">依赖关系读取失败</p>
                <p className="mt-1 max-w-md text-xs text-[var(--color-muted-foreground)]">{loadError}</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>重试</Button>
              </div>
            </div>
          ) : (
            <>
              {unavailableDependencies.length > 0 && (
                <div className="mb-3 border-l-2 border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning-soft-foreground)]">
                  {unavailableDependencies.length} 个已保存依赖不在当前工作区。保存后将移除这些失效绑定。
                </div>
              )}
              {candidates.length ? (
                <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
                  {candidates.map(project => {
                    const checked = Boolean(selected[project.path])
                    const state = dependencyByPath.get(project.path)
                    return (
                      <div
                        key={project.path}
                        className={cn(
                          'flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-[var(--color-muted)]/40',
                          checked && 'bg-[var(--color-primary)]/5',
                        )}
                      >
                        <button type="button" onClick={() => toggle(project.path)} className={cn(
                          'grid size-5 shrink-0 place-items-center rounded border',
                          checked
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                            : 'border-[var(--color-border)] bg-[var(--color-background)]',
                        )} aria-label={checked ? `移除 ${project.name}` : `关联 ${project.name}`}>
                          {checked && <Check className="size-3.5" />}
                        </button>
                        <button type="button" onClick={() => toggle(project.path)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-medium text-[var(--color-foreground)]">{getSystemWorkspaceDisplayName(project)}</span>
                          <span className="block truncate font-mono text-[10px] text-[var(--color-muted-foreground)]" title={project.path}>{project.path}</span>
                        </button>
                        {checked && (
                          <div className="flex shrink-0 items-center gap-2">
                            <select
                              value={selected[project.path]}
                              onChange={event => setRelation(project.path, event.target.value as ProjectDependencyRelation)}
                              onClick={event => event.stopPropagation()}
                              className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
                              aria-label={`${project.name} 的项目关系`}
                            >
                              <option value="REFACTORS">重构自</option>
                              <option value="MIGRATES_FROM">迁移自</option>
                              <option value="DEPENDS_ON">依赖</option>
                              <option value="INTEGRATES_WITH">集成</option>
                            </select>
                            <span className="hidden items-center gap-2 text-[10px] text-[var(--color-muted-foreground)] lg:flex">
                              <span className="inline-flex items-center gap-1"><FolderGit2 className="size-3" />源码 {state ? (state.sourceAvailable ? '可用' : '缺失') : '待检测'}</span>
                              <span className="inline-flex items-center gap-1"><Database className="size-3" />知识 {state ? (state.knowledgeAvailable ? '可用' : '未就绪') : '待检测'}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="grid min-h-44 place-items-center border-y border-dashed border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
                  {projects.length > 1 ? '没有匹配项目' : '当前工作区没有其他可依赖项目'}
                </div>
              )}
            </>
          )}
          {(selectionError || saveError) && (
            <p className="mt-3 text-xs text-[var(--color-destructive)]">{selectionError ?? saveError}</p>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
          <span className="text-xs text-[var(--color-muted-foreground)]">已选 {Object.keys(selected).length} / {MAX_DEPENDENCY_COUNT}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="button" onClick={() => onSave(Object.entries(selected).map(([projectPath, relation]) => ({ projectPath, relation })))} disabled={loading || Boolean(loadError) || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}保存关联
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
