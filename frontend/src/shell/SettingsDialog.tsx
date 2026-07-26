import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ListChecks, Palette, Tags, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeAppearanceSection } from './ThemeAppearanceSection'
import { BrandEditor } from './BrandEditor'
import { MenuVisibilitySection } from './MenuVisibilitySection'

type Section = 'appearance' | 'brand' | 'menu'

const NAV_ITEMS: { id: Section; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'brand', label: '品牌', icon: Tags },
  { id: 'menu', label: '菜单', icon: ListChecks },
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
 * 真正「会反复调整」的配置（外观/品牌/菜单可见性）在这里集中呈现，不再跳独立页面。
 */
export function SettingsDialog({ open, onOpenChange, initialSection = 'appearance' }: SettingsDialogProps) {
  const [section, setSection] = useState<Section>(initialSection)

  // 每次打开都回到调用方指定的默认分区（而非停留在上次关闭时的分区）
  useEffect(() => { if (open) setSection(initialSection) }, [open, initialSection])

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
            'fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col',
            // 移动端占满可用宽高（留安全边距），桌面端回到定宽居中卡片
            'h-[min(88vh,560px)] w-[min(96vw,720px)]',
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

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            {/* 分区导航：窄屏横向 tab 条（避免固定 w-40 侧栏吃掉半个屏宽），宽屏回到左侧竖排 */}
            <nav
              className={cn(
                'flex shrink-0 gap-1 overflow-x-auto border-b p-2',
                'sm:w-40 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r',
              )}
            >
              {NAV_ITEMS.map(item => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors sm:w-full sm:px-2',
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
            <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
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

              {section === 'menu' && (
                <div>
                  <h3 className="mb-3 text-sm font-medium">菜单显示</h3>
                  <MenuVisibilitySection />
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
