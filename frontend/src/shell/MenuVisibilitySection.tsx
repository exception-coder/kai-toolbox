import { useMemo, useState } from 'react'
import { Eye, EyeOff, RotateCcw, Search, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { features } from './featureRegistry'
import { hasFeatureAccess } from './access'
import { useAccessContext } from './permission'
import { resetMenuVisibility, setManyVisible, setMenuVisible, useMenuVisibleSet } from './menuVisibility'
import type { FeatureManifest } from './types'

/**
 * 「菜单」偏好分区：勾选各模块是否在侧栏/首页显示（软隐藏，路由仍在，按账号存后端）。
 * 原独立页面 /tools/menu-settings 已并入本弹窗——菜单可见性本质是个人偏好，
 * 与外观/品牌同属「配置一次、偶尔调整」的 Persistent UI，不该占一个功能菜单位。
 * 只列当前账号有权访问的功能模块；manifest.hidden 的模块已在注册表层剔除，只能改源码开启。
 */
export function MenuVisibilitySection() {
  const access = useAccessContext()
  const visibleSet = useMenuVisibleSet()
  const [query, setQuery] = useState('')
  const menuFeatures = useMemo(
    () => features.filter((f) => !f.chrome && hasFeatureAccess(f, access)),
    [access],
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredFeatures = useMemo(() => {
    if (!normalizedQuery) return menuFeatures
    return menuFeatures.filter((feature) => [
      feature.name,
      feature.description,
      feature.group,
      feature.id,
    ].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedQuery))
  }, [menuFeatures, normalizedQuery])
  const groups = useMemo(() => groupFeatures(filteredFeatures), [filteredFeatures])
  const allIds = useMemo(() => menuFeatures.map((f) => f.id), [menuFeatures])
  const visibleCount = menuFeatures.filter((f) => visibleSet.has(f.id)).length

  return (
    <div>
      <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">
        勾选各模块是否在菜单显示。隐藏仅影响侧边栏与首页，路由仍可用（Ctrl/⌘+K 直达）；设置按账号保存，多设备同步。
      </p>

      <div className="relative mt-3">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]"
        />
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('')
              event.currentTarget.blur()
            }
          }}
          placeholder="搜索菜单名称、描述、分组或 ID"
          aria-label="搜索菜单"
          className="h-9 w-full rounded-md border bg-[var(--color-background)] pl-9 pr-9 text-sm outline-none placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空菜单搜索"
            title="清空搜索"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-[var(--color-muted-foreground)]">
          已显示 {visibleCount} / {menuFeatures.length}
          {normalizedQuery && ` · 找到 ${filteredFeatures.length} 个`}
        </span>
        <Button variant="outline" size="sm" onClick={() => resetMenuVisibility()} title="恢复默认可见集">
          <Sparkles className="size-4" />
          恢复默认
        </Button>
        <Button variant="outline" size="sm" onClick={() => setManyVisible(allIds, true)}>
          <RotateCcw className="size-4" />
          全部显示
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Search className="mx-auto size-5 text-[var(--color-muted-foreground)]" />
            <p className="mt-2 text-sm font-medium">没有找到相关菜单</p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">换个关键词，或清空搜索查看全部菜单。</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setQuery('')}>
              清空搜索
            </Button>
          </div>
        ) : (
          groups.map(({ group, items }) => (
            <section key={group ?? '_'} className="rounded-lg border">
              <div className="border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {group ?? '通用'}
              </div>
              <ul className="divide-y">
                {items.map((f) => {
                  const Icon = f.icon
                  const visible = visibleSet.has(f.id)
                  return (
                    <li key={f.id} className="flex items-center gap-2.5 px-3 py-2">
                      <Icon className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{f.name}</div>
                        {/* 描述在窄屏隐藏：手机上先保证模块名不被挤成竖排 */}
                        {f.description && (
                          <div className="hidden truncate text-xs text-[var(--color-muted-foreground)] sm:block">
                            {f.description}
                          </div>
                        )}
                      </div>
                      <VisibilityToggle visible={visible} onToggle={() => setMenuVisible(f.id, !visible)} />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

/** 展示/隐藏开关：pill 样式，点亮=显示。 */
function VisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      onClick={onToggle}
      title={visible ? '点击隐藏' : '点击显示'}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border p-1.5 text-xs font-medium transition-colors sm:px-2.5 sm:py-1',
        visible
          ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          : 'border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
      )}
    >
      {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {/* 窄屏只留图标（开关语义由 aria-checked + 配色承担），把宽度让给模块名 */}
      <span className="hidden sm:inline">{visible ? '显示' : '隐藏'}</span>
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
