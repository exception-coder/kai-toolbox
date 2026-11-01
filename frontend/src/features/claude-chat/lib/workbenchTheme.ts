import { useLayoutEffect, useSyncExternalStore, type CSSProperties } from 'react'
import { getUser, useAuth } from '@/lib/auth'

export type WorkbenchTheme = 'tokyo-night' | 'catppuccin' | 'nord' | 'inherit'
const prefix = 'forge.vibecoding.theme:'
const changeEvent = 'forge:workbench-theme'

/** 只持有视觉 Token；布局和动效分别由原 focus 与全局 comfort 配置拥有。 */
export const WORKBENCH_THEMES = [
  { id: 'tokyo-night', name: 'Tokyo Night', description: '科技蓝紫 · 推荐', colors: ['#1a1b26', '#24283b', '#16161e', '#292e42', '#363b54', '#c0caf5', '#a9b1d6', '#7aa2f7', '#bb9af7', '#9ece6a'] },
  { id: 'catppuccin', name: 'Catppuccin', description: '柔和粉紫 · Mocha', colors: ['#1e1e2e', '#27273a', '#181825', '#313244', '#45475a', '#cdd6f4', '#a6adc8', '#cba6f7', '#89b4fa', '#a6e3a1'] },
  { id: 'nord', name: 'Nord', description: '极地蓝灰 · 低饱和', colors: ['#2e3440', '#3b4252', '#272d38', '#434c5e', '#4c566a', '#eceff4', '#b8c2d4', '#88c0d0', '#b48ead', '#a3be8c'] },
] as const
const tokenNames = ['background', 'surface', 'sidebar', 'raised', 'border', 'text', 'muted', 'accent', 'keyword', 'string'] as const

export function workbenchThemeName(theme: WorkbenchTheme) {
  return WORKBENCH_THEMES.find(option => option.id === theme)?.name ?? '跟随全局外观'
}

export function workbenchThemeStyle(theme: WorkbenchTheme): CSSProperties {
  const palette = WORKBENCH_THEMES.find(option => option.id === theme)
  return palette ? Object.fromEntries(tokenNames.map((name, index) => [`--wb-${name}`, palette.colors[index]])) as CSSProperties : {}
}

export function readWorkbenchTheme(userId?: number): WorkbenchTheme {
  try {
    const stored = localStorage.getItem(prefix + (userId ?? 'local'))
    if (stored === 'inherit' || WORKBENCH_THEMES.some(option => option.id === stored)) return stored as WorkbenchTheme
  } catch { /* 不能读取时使用产品默认；保存失败由选择器明确显示。 */ }
  return 'tokyo-night'
}

export function setWorkbenchTheme(theme: WorkbenchTheme, userId = getUser()?.userId) {
  if (theme !== 'inherit' && !WORKBENCH_THEMES.some(option => option.id === theme)) throw new Error('未知工作台主题')
  localStorage.setItem(prefix + (userId ?? 'local'), theme)
  window.dispatchEvent(new Event(changeEvent))
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key?.startsWith(prefix)) listener() }
  window.addEventListener(changeEvent, listener)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener('storage', onStorage) }
}

export function useWorkbenchTheme() {
  const { user } = useAuth()
  return useSyncExternalStore(subscribe, () => readWorkbenchTheme(user?.userId), () => 'tokyo-night' as const)
}

/** 仅普通会话路由挂载时覆盖 Shell/Portal；卸载恢复原外观，悬浮窗只使用自身作用域。 */
export function useWorkbenchPageTheme(theme: WorkbenchTheme) {
  useLayoutEffect(() => {
    if (theme === 'inherit') return
    const root = document.documentElement
    const previousAttribute = root.getAttribute('data-workbench-theme')
    const style = workbenchThemeStyle(theme) as Record<string, string>
    const previousStyles = Object.keys(style).map(key => [key, root.style.getPropertyValue(key), root.style.getPropertyPriority(key)])
    root.dataset.workbenchTheme = theme
    Object.entries(style).forEach(([key, value]) => root.style.setProperty(key, value))
    return () => {
      if (previousAttribute === null) root.removeAttribute('data-workbench-theme')
      else root.setAttribute('data-workbench-theme', previousAttribute)
      previousStyles.forEach(([key, value, priority]) => {
        if (value) root.style.setProperty(key!, value, priority)
        else root.style.removeProperty(key!)
      })
    }
  }, [theme])
}
