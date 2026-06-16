import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  THEME_ACCENTS,
  THEME_MODES,
  loadTheme,
  setTheme,
  type ThemeAccent,
  type ThemeMode,
} from './theme'
import { BrandEditor } from './BrandEditor'
import { cn } from '@/lib/utils'

interface ThemeMenuProps {
  /** 紧凑触发：用于悬浮窗 header 等行高受限处，按钮缩小到与同排小图标按钮一致 */
  dense?: boolean
}

/** 顶栏主题菜单：明暗模式（单选）+ 主色（色块单选）+ 应用品牌（名称/副标题），正交组合。 */
export function ThemeMenu({ dense = false }: ThemeMenuProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ThemeMode>('system')
  const [accent, setAccent] = useState<ThemeAccent>('indigo')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const s = loadTheme()
    setMode(s.mode)
    setAccent(s.accent)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pickMode = (m: ThemeMode) => {
    setMode(m)
    setTheme({ mode: m, accent })
  }
  const pickAccent = (a: ThemeAccent) => {
    setAccent(a)
    setTheme({ mode, accent: a })
  }

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
          <div className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">明暗模式</div>
          <div className="mb-3 flex flex-col">
            {THEME_MODES.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-muted)]"
              >
                <span>{m.label}</span>
                {mode === m.id && <Check className="size-4 text-[var(--color-primary)]" />}
              </button>
            ))}
          </div>

          <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">主色</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {THEME_ACCENTS.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => pickAccent(a.id)}
                title={a.label}
                aria-label={a.label}
                className={
                  'size-7 rounded-full border-2 transition-transform hover:scale-110 '
                  + (accent === a.id ? 'border-[var(--color-foreground)]' : 'border-transparent')
                }
                style={{ background: a.swatch }}
              />
            ))}
          </div>

          <div className="border-t pt-3">
            <BrandEditor />
          </div>
        </div>
      )}
    </div>
  )
}
