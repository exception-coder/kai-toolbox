import { Star } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { useSystemModuleCatalog } from '@/hooks/useSystemModuleCatalog'

interface SystemModuleSelectorProps {
  systems: string[]
  modules: string[]
  primarySystem: string
  onSystemsChange: (systems: string[], primarySystem: string) => void
  onModulesChange: (modules: string[]) => void
  required?: boolean
  className?: string
}

/** 统一的系统、模块多选器；多系统时以列表首项持久化主系统语义。 */
export function SystemModuleSelector({
  systems,
  modules,
  primarySystem,
  onSystemsChange,
  onModulesChange,
  required = false,
  className = '',
}: SystemModuleSelectorProps) {
  const catalog = useSystemModuleCatalog(systems)

  const handleSystemsChange = (nextSystems: string[]) => {
    const nextPrimary = nextSystems.includes(primarySystem) ? primarySystem : nextSystems[0] ?? ''
    onSystemsChange(prioritize(nextSystems, nextPrimary), nextPrimary)
    onModulesChange([])
  }

  const handlePrimaryChange = (nextPrimary: string) => {
    onSystemsChange(prioritize(systems, nextPrimary), nextPrimary)
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="min-w-0 text-xs font-medium">
          <span className="mb-1.5 block">
            关联系统{required && <span className="ml-1 text-red-500">*</span>}
          </span>
          <MultiSelect
            id="system-input"
            value={systems}
            onChange={handleSystemsChange}
            options={catalog.systemOptions}
            placeholder="选择或输入系统，可多选"
            emptyText="没有匹配的系统"
          />
        </label>
        <label className="min-w-0 text-xs font-medium">
          <span className="mb-1.5 block">
            关联模块{required && <span className="ml-1 text-red-500">*</span>}
            {systems.length > 1 && <span className="font-normal text-[var(--color-muted-foreground)]">（按系统分组）</span>}
          </span>
          <MultiSelect
            id="system-module-input"
            value={modules}
            onChange={onModulesChange}
            options={catalog.moduleOptions}
            placeholder={systems.length ? '选择或输入模块，可多选' : required ? '请先选择系统' : '选择或输入模块，可选'}
            emptyText={systems.length ? '没有匹配的模块' : required ? '选择系统后加载模块' : '可直接输入新模块'}
          />
        </label>
      </div>

      {systems.length > 1 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
            <Star className="h-3 w-3" />指定主系统
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="主系统">
            {systems.map(system => {
              const active = system === primarySystem
              return (
                <button
                  key={system}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handlePrimaryChange(system)}
                  className={`border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  {active && <Star className="mr-1 inline h-3 w-3 fill-current" />}
                  {system}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">主系统用于标题前缀和默认开发上下文。</p>
        </div>
      )}

      {catalog.isLoading && <p className="text-[10px] text-[var(--color-muted-foreground)]">正在加载系统模块清单…</p>}
      {catalog.error && <p className="text-[10px] text-[var(--color-danger)]">系统模块清单加载失败，可直接输入自定义值。</p>}
    </div>
  )
}

function prioritize(systems: string[], primarySystem: string) {
  if (!primarySystem) return systems
  return [primarySystem, ...systems.filter(system => system !== primarySystem)]
}
