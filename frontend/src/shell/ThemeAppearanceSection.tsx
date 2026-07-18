import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  THEME_ACCENTS,
  THEME_MODES,
  loadTheme,
  setTheme,
  type ThemeAccent,
  type ThemeMode,
} from './theme'

/**
 * 外观控制（明暗模式 + 主色）自包含内容块：不接受 props，直接读写 theme.ts 落盘。
 * 抽出来是因为同一段选择器过去在 ThemeMenu（顶栏/悬浮窗快速面板）与账号菜单里各抄了一份，
 * 现在两处都该复用同一份——账号菜单已改为在「偏好设置」弹窗里渲染本组件。
 */
export function ThemeAppearanceSection() {
  const [mode, setMode] = useState<ThemeMode>('system')
  const [accent, setAccent] = useState<ThemeAccent>('indigo')

  useEffect(() => {
    const s = loadTheme()
    setMode(s.mode)
    setAccent(s.accent)
  }, [])

  const pickMode = (m: ThemeMode) => { setMode(m); setTheme({ mode: m, accent }) }
  const pickAccent = (a: ThemeAccent) => { setAccent(a); setTheme({ mode, accent: a }) }

  return (
    <div>
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
      <div className="flex flex-wrap gap-2">
        {THEME_ACCENTS.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => pickAccent(a.id)}
            title={a.label}
            aria-label={a.label}
            className={cn(
              'size-7 rounded-full border-2 transition-transform hover:scale-110',
              accent === a.id ? 'border-[var(--color-foreground)]' : 'border-transparent'
            )}
            style={{ background: a.swatch }}
          />
        ))}
      </div>
    </div>
  )
}
