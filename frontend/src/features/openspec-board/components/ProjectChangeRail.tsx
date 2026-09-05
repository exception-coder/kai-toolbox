import { AlertCircle, CheckCircle2, FolderKanban } from 'lucide-react'
import type { OpenSpecProjectSummary } from '../types'

interface ProjectChangeRailProps {
  projects: OpenSpecProjectSummary[]
  projectId: string
  changeId: string
  onProjectSelect: (projectId: string) => void
  onChangeSelect: (changeId: string) => void
}

export function ProjectChangeRail({ projects, projectId, changeId, onProjectSelect, onChangeSelect }: ProjectChangeRailProps) {
  const project = projects.find(item => item.id === projectId) ?? null

  return (
    <aside className="min-w-0 border-b border-[var(--color-border)] pb-4 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-4">
      <label className="text-[11px] font-medium text-[var(--color-muted-foreground)]" htmlFor="openspec-project">
        项目
      </label>
      <select
        id="openspec-project"
        value={projectId}
        onChange={event => onProjectSelect(event.target.value)}
        className="mt-2 h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>

      {project && project.state !== 'READY' ? (
        <div className="mt-4 border-l-2 border-[var(--color-warning)] pl-3">
          <div className="flex items-center gap-2 text-xs font-medium"><AlertCircle className="size-3.5" />需要处理</div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">{project.message}</p>
          <a
            href="/tools/forge-environment"
            className="mt-3 inline-flex text-xs font-medium text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            打开 Forge 环境
          </a>
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] font-medium text-[var(--color-muted-foreground)]">
            <span>活动需求</span><span>{project?.changes.length ?? 0}</span>
          </div>
          <div className="mt-2 space-y-1">
            {project?.changes.map(change => {
              const selected = change.id === changeId
              return (
                <button
                  key={change.id}
                  type="button"
                  onClick={() => onChangeSelect(change.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${selected ? 'border-[var(--color-primary)] bg-[var(--color-selection)]' : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]/50'}`}
                >
                  <div className="flex items-start gap-2">
                    {change.state === 'COMPLETE' ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" /> : <FolderKanban className="mt-0.5 size-3.5 shrink-0 text-[var(--color-primary)]" />}
                    <span className="min-w-0 text-xs font-medium leading-5">{change.title}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between pl-5 text-[10px] text-[var(--color-muted-foreground)]">
                    <span className="truncate font-mono">{change.id}</span>
                    <span>{change.completedTasks}/{change.totalTasks}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}
