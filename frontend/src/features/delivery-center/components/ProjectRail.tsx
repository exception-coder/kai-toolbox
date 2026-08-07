import { AlertTriangle, Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectView } from '../viewModel'

interface Props {
  projects: ProjectView[]
  selected: string
  onSelect: (project: string) => void
}

export function ProjectRail({ projects, selected, onSelect }: Props) {
  return (
    <nav className="min-w-0 border-b border-[var(--color-border)] pb-3 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          项目空间
        </h2>
        <span className="text-[9px] text-[var(--color-muted-foreground)]">{projects.length} projects</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-1 xl:overflow-visible">
        {projects.map(project => {
          const active = project.name === selected
          return (
            <button
              key={project.name}
              type="button"
              onClick={() => onSelect(project.name)}
              className={cn(
                'group min-w-[210px] px-3 py-3 text-left transition-colors xl:min-w-0 xl:w-full',
                active
                  ? 'bg-[var(--color-primary)]/8'
                  : 'hover:bg-[var(--color-muted)]/60',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  active ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-muted-foreground)]/40',
                )} />
                <strong className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-foreground)]">
                  {project.name}
                </strong>
                <span className="text-sm font-semibold text-[var(--color-foreground)]">{project.progress}%</span>
              </div>
              <div className="mt-2 h-px bg-[var(--color-border)]">
                <div
                  className={cn('h-px', active ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-muted-foreground)]/50')}
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-[var(--color-muted-foreground)]">
                <span>{project.requirementCount} 个需求</span>
                {project.highRiskCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[var(--color-danger)]">
                    <AlertTriangle className="h-2.5 w-2.5" />{project.highRiskCount}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-2.5 w-2.5" />{relativeTime(project.updatedAt)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function relativeTime(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}
