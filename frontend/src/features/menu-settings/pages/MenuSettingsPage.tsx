import { useMemo } from 'react'
import { Eye, EyeOff, ListChecks, Lock, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { features } from '@/shell/featureRegistry'
import { resetMenuVisibility, setManyVisible, setMenuVisible, useMenuVisibleSet } from '@/shell/menuVisibility'
import type { FeatureManifest } from '@/shell/types'

/** 本模块自身不可被隐藏——否则勾掉后就再也进不来「菜单配置」了（防锁死）。 */
const SELF_ID = 'menu-settings'

/**
 * 菜单配置：勾选各模块是否在菜单显示（软隐藏，存本地，路由仍在、随时勾回）。
 * 默认只显示核心模块（DEFAULT_VISIBLE_IDS），其余默认隐藏——可在此勾选显示，或 Ctrl+K 命令面板直达。
 * 「睿程 ERP 全景图」等 manifest.hidden 的模块已在注册表层剔除，不在此清单——只能改源码开启。
 */
export function MenuSettingsPage() {
  const visibleSet = useMenuVisibleSet()
  const groups = useMemo(() => groupFeatures(features), [])
  const allIds = useMemo(() => features.map((f) => f.id), [])
  const visibleCount = features.filter((f) => visibleSet.has(f.id)).length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
            <ListChecks className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">菜单配置</h1>
            <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">
              勾选各模块是否在菜单显示。默认只显示核心模块，其余可在此开启或用 Ctrl/⌘+K 直达；隐藏仅影响侧边栏与首页，路由仍可用。设置存本机浏览器。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted-foreground)]">已显示 {visibleCount} / {features.length}</span>
          <Button variant="outline" size="sm" onClick={() => resetMenuVisibility()} title="只保留核心模块">
            <Sparkles className="size-4" />
            恢复默认
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManyVisible(allIds, true)}>
            <RotateCcw className="size-4" />
            全部显示
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map(({ group, items }) => (
          <section key={group ?? '_'} className="rounded-lg border bg-[var(--color-background)]">
            <div className="border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {group ?? '通用'}
            </div>
            <ul className="divide-y">
              {items.map((f) => {
                const Icon = f.icon
                const isSelf = f.id === SELF_ID
                const visible = visibleSet.has(f.id)
                return (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {f.name}
                        {isSelf && (
                          <span className="inline-flex items-center gap-1 rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-muted-foreground)]">
                            <Lock className="size-3" />
                            始终显示
                          </span>
                        )}
                      </div>
                      {f.description && (
                        <div className="truncate text-xs text-[var(--color-muted-foreground)]">{f.description}</div>
                      )}
                    </div>
                    <VisibilityToggle
                      visible={visible}
                      disabled={isSelf}
                      onToggle={() => setMenuVisible(f.id, !visible)}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs leading-5 text-[var(--color-muted-foreground)]">
        提示：部分模块（如「睿程 ERP 全景图」）在源码中标记为隐藏，不在此清单，只能通过修改源码开启。
      </p>
    </div>
  )
}

/** 展示/隐藏开关：拟物 pill 样式，点亮=显示。锁定态（本模块自身）禁用。 */
function VisibilityToggle({ visible, disabled, onToggle }: { visible: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      disabled={disabled}
      onClick={onToggle}
      title={disabled ? '本模块始终显示' : visible ? '点击隐藏' : '点击显示'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        disabled && 'cursor-not-allowed opacity-60',
        visible
          ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          : 'border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
      )}
    >
      {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {visible ? '显示' : '隐藏'}
    </button>
  )
}

function groupFeatures(items: FeatureManifest[]) {
  const map = new Map<string | null, FeatureManifest[]>()
  for (const f of items) {
    const k = f.group ?? null
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(f)
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}
