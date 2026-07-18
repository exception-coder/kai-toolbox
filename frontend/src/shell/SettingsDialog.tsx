import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Palette, Tags, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { entryOf, features } from './featureRegistry'
import { hasFeatureAccess } from './access'
import { ThemeAppearanceSection } from './ThemeAppearanceSection'
import { BrandEditor } from './BrandEditor'

type Section = 'appearance' | 'brand' | 'workspace'

const NAV_ITEMS: { id: Section; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'brand', label: '品牌', icon: Tags },
  { id: 'workspace', label: '工作区', icon: LayoutGrid },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** 打开时默认落在哪个分区，默认「外观」。 */
  initialSection?: Section
}

/**
 * 工作区设置：持久化配置（Persistent UI）从账号菜单（Transient UI）里搬出来，独立成一个居中弹窗，
 * 左侧导航 + 右侧内容，参考 Notion/Cursor/Linear 的 Settings 心智——用完即关的账号菜单只留入口，
 * 真正「会反复调整」的配置（外观/品牌/工作区导航）在这里集中呈现。
 */
export function SettingsDialog({ open, onOpenChange, initialSection = 'appearance' }: SettingsDialogProps) {
  const [section, setSection] = useState<Section>(initialSection)
  const navigate = useNavigate()
  const { user } = useAuth()

  // 每次打开都回到调用方指定的默认分区（而非停留在上次关闭时的分区）
  useEffect(() => { if (open) setSection(initialSection) }, [open, initialSection])

  // 「工作区」分区收纳的管理类页面（如菜单配置），沿用原账号菜单里 chromeItems 的口径
  const workspaceItems = features.filter(f => f.chrome && hasFeatureAccess(f, user?.roles ?? []))

  const goWorkspaceItem = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50 transition-opacity duration-150',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex h-[min(80vh,560px)] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'overflow-hidden rounded-xl border bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-2xl',
            'transition-all duration-150',
            'data-[state=closed]:scale-95 data-[state=closed]:opacity-0',
            'data-[state=open]:scale-100 data-[state=open]:opacity-100',
            'focus:outline-none',
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold">工作区设置</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="关闭"
              className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* 左侧导航 */}
            <nav className="w-40 shrink-0 border-r p-2">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      active
                        ? 'bg-[var(--color-accent)] font-medium text-[var(--color-accent-foreground)]'
                        : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </button>
                )
              })}
            </nav>

            {/* 右侧内容 */}
            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              {section === 'appearance' && (
                <div>
                  <h3 className="mb-3 text-sm font-medium">外观</h3>
                  <ThemeAppearanceSection />
                </div>
              )}

              {section === 'brand' && (
                <div>
                  <h3 className="mb-3 text-sm font-medium">应用品牌</h3>
                  <div className="max-w-xs">
                    <BrandEditor />
                  </div>
                </div>
              )}

              {section === 'workspace' && (
                <div>
                  <h3 className="mb-3 text-sm font-medium">工作区</h3>
                  {workspaceItems.length === 0 ? (
                    <p className="text-sm text-[var(--color-muted-foreground)]">暂无可管理的工作区页面。</p>
                  ) : (
                    <div className="space-y-1">
                      {workspaceItems.map(f => {
                        const Icon = f.icon
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => goWorkspaceItem(entryOf(f))}
                            className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--color-accent)]/60"
                          >
                            <Icon className="mt-0.5 size-4 shrink-0 text-[var(--color-muted-foreground)]" />
                            <span className="min-w-0">
                              <span className="block text-sm">{f.name}</span>
                              {f.description && (
                                <span className="block truncate text-xs text-[var(--color-muted-foreground)]">{f.description}</span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
