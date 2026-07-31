import { AlertTriangle, Boxes, Search } from 'lucide-react'
import type { DeliveryFinding, DeliveryRequirement, DeliveryStageKey } from '../types'
import { buildModules, findingsForRequirement } from '../viewModel'
import { PrdDeliveryTrack } from './PrdDeliveryTrack'

interface Props {
  project: string
  requirements: DeliveryRequirement[]
  findings: DeliveryFinding[]
  query: string
  onQueryChange: (value: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onStageSelect: (requirement: DeliveryRequirement, stage: DeliveryStageKey) => void
}

export function DeliveryCanvas({
  project,
  requirements,
  findings,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  onStageSelect,
}: Props) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const filtered = normalizedQuery
    ? requirements.filter(item =>
        `${item.title} ${item.module}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
      )
    : requirements
  const modules = buildModules(filtered, findings)

  return (
    <section
      className="min-h-[620px] min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-background)]"
      style={{
        backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--color-muted-foreground) 22%, transparent) 0.7px, transparent 0.7px)',
        backgroundSize: '18px 18px',
      }}
    >
      <header className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            <Boxes className="h-3 w-3" />Delivery map
          </div>
          <h2 className="mt-1 text-base font-semibold text-[var(--color-foreground)]">{project}</h2>
        </div>
        <label className="flex h-8 w-full items-center gap-2 border-b border-[var(--color-border)] px-1 sm:w-56">
          <Search className="h-3 w-3 text-[var(--color-muted-foreground)]" />
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="搜索模块或 PRD"
            className="min-w-0 flex-1 bg-transparent text-[10px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
        </label>
      </header>

      <div className="relative p-5">
        <div className="absolute bottom-5 left-[2.15rem] top-5 w-px bg-[var(--color-border)]" />
        {modules.length === 0 ? (
          <div className="py-24 text-center text-xs text-[var(--color-muted-foreground)]">没有匹配的模块或 PRD</div>
        ) : (
          <div className="space-y-7">
            {modules.map(module => (
              <article key={module.name} className="relative pl-8">
                <span className="absolute left-[0.1rem] top-2 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-background)] bg-[var(--color-primary)] ring-1 ring-[var(--color-border)]" />
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-xs font-semibold text-[var(--color-foreground)]">{module.name}</h3>
                  <span className="text-xl font-semibold text-[var(--color-foreground)]">{module.progress}%</span>
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">{module.requirementCount} PRD</span>
                  {module.highRiskCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-[var(--color-danger)]">
                      <AlertTriangle className="h-2.5 w-2.5" />{module.highRiskCount} high risk
                    </span>
                  )}
                </div>
                <div className="border-l border-[var(--color-border)] bg-[var(--color-background)]/86">
                  {module.requirements.map(requirement => (
                    <PrdDeliveryTrack
                      key={requirement.id}
                      requirement={requirement}
                      findings={findingsForRequirement(findings, requirement.id)}
                      selected={selectedId === requirement.id}
                      onSelect={() => onSelect(requirement.id)}
                      onStageSelect={stage => onStageSelect(requirement, stage)}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
