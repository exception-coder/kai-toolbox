import { useRef, useState } from 'react'
import { Palette, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BrandEditor } from './BrandEditor'
import { SettingsDialog } from './SettingsDialog'
import { AppearanceAccentPicker, AppearanceModePicker, ThemeSummary } from './AppearanceSelectors'
import { useThemeState } from './useThemeState'
import { cn } from '@/lib/utils'

interface ThemeMenuProps {
  /** 用于悬浮窗 header 等行高受限区域。 */
  dense?: boolean
}

export function ThemeMenu({ dense = false }: ThemeMenuProps) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const state = useThemeState()
  const triggerRef = useRef<HTMLButtonElement>(null)

  const openFullSettings = () => {
    setOpen(false)
    setSettingsOpen(true)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {dense ? (
            <button
              ref={triggerRef}
              type="button"
              title="主题与配色"
              aria-label="主题与配色"
              className={cn('rounded p-1 hover:bg-[var(--color-background)]', open && 'bg-[var(--color-background)]')}
            >
              <Palette className="size-4" />
            </button>
          ) : (
            <Button
              ref={triggerRef}
              variant="ghost"
              size="icon"
              title="主题与配色"
              aria-label="主题与配色"
            >
              <Palette className="size-4" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="快速外观设置"
          onPointerDown={event => event.stopPropagation()}
          className="max-h-[min(var(--radix-popover-content-available-height),34rem)] w-[min(18rem,calc(100vw-2rem))] space-y-4 overflow-y-auto rounded-xl p-3 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">快速外观</span>
            <ThemeSummary state={state} />
          </div>
          <AppearanceModePicker mode={state.mode} compact />
          <AppearanceAccentPicker accent={state.accent} compact />
          <button
            type="button"
            onClick={openFullSettings}
            className="flex min-h-10 w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <span className="flex items-center gap-2"><SlidersHorizontal className="size-4" />更多外观设置</span>
            <span aria-hidden="true">›</span>
          </button>
          <div className="border-t border-[var(--color-border)] pt-3">
            <BrandEditor />
          </div>
        </PopoverContent>
      </Popover>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection="appearance"
        returnFocusRef={triggerRef}
      />
    </>
  )
}
