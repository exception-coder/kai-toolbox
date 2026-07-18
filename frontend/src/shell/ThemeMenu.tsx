import { useEffect, useRef, useState } from 'react'
import { Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeAppearanceSection } from './ThemeAppearanceSection'
import { BrandEditor } from './BrandEditor'
import { cn } from '@/lib/utils'

interface ThemeMenuProps {
  /** 紧凑触发：用于悬浮窗 header 等行高受限处，按钮缩小到与同排小图标按钮一致 */
  dense?: boolean
}

/** 顶栏主题菜单：明暗模式（单选）+ 主色（色块单选）+ 应用品牌（名称/副标题），正交组合。 */
export function ThemeMenu({ dense = false }: ThemeMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {dense ? (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title="主题与配色"
          aria-label="主题与配色"
          className={cn('rounded p-1 hover:bg-[var(--color-background)]', open && 'bg-[var(--color-background)]')}
        >
          <Palette className="size-4" />
        </button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(o => !o)}
          title="主题与配色"
          aria-label="主题与配色"
        >
          <Palette className="h-4 w-4" />
        </Button>
      )}

      {open && (
        <div
          onPointerDown={e => e.stopPropagation()}
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border bg-[var(--color-popover)] p-3 text-[var(--color-popover-foreground)] shadow-xl">
          <ThemeAppearanceSection />
          <div className="mt-3 border-t pt-3">
            <BrandEditor />
          </div>
        </div>
      )}
    </div>
  )
}
