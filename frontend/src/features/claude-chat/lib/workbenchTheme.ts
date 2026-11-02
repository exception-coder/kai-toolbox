import { useLayoutEffect, useSyncExternalStore, type CSSProperties } from 'react'
import { getUser, useAuth } from '@/lib/auth'
import { readingChangeEvent } from './workspacePreferences'

export type WorkbenchTheme = typeof WORKBENCH_THEMES[number]['id'] | 'inherit'
const prefix = 'forge.vibecoding.theme:'
const changeEvent = 'forge:workbench-theme'

/** 只持有视觉 Token；布局和动效分别由原 focus 与全局 comfort 配置拥有。 */
export const CLASSIC_THEMES = [
  { id: 'tokyo-night', name: 'Tokyo Night', description: '科技蓝紫 · 推荐', colors: ['#1a1b26', '#24283b', '#16161e', '#292e42', '#363b54', '#c0caf5', '#a9b1d6', '#7aa2f7', '#bb9af7', '#9ece6a'] },
  { id: 'catppuccin', name: 'Catppuccin', description: '柔和粉紫 · Mocha', colors: ['#1e1e2e', '#27273a', '#181825', '#313244', '#45475a', '#cdd6f4', '#a6adc8', '#cba6f7', '#89b4fa', '#a6e3a1'] },
  { id: 'nord', name: 'Nord', description: '极地蓝灰 · 低饱和', colors: ['#2e3440', '#3b4252', '#272d38', '#434c5e', '#4c566a', '#eceff4', '#b8c2d4', '#88c0d0', '#d0b2d7', '#a3be8c'] },
  { id: 'cyberpunk', name: 'Cyberpunk', description: '深靛 · 青色与品红', colors: ['#171525', '#211f33', '#110f1b', '#2b283f', '#49435c', '#e2def5', '#b9b0ce', '#7de5ef', '#f4a2d4', '#c4e88d'] },
  { id: 'terminal-hacker', name: 'Terminal Hacker', description: '墨绿 · 等宽与琥珀', colors: ['#151c18', '#1e2922', '#101713', '#2a362e', '#44594a', '#d8e8dc', '#aec4b5', '#9adeac', '#efcd92', '#b7db96'] },
  { id: 'ai-studio', name: 'AI Studio', description: '蓝灰 · 清晰的紫蓝层次', colors: ['#191d2b', '#242a3b', '#141722', '#2d3549', '#48546c', '#e0e8fa', '#b6c4df', '#9fbfff', '#d3b3f5', '#9ddaca'] },
] as const
export const IMMERSIVE_SKINS = [
  { id: 'butter-paper', name: 'Butter Paper', description: '黄油纸 · 温暖的手帖', colors: ['#f3ecd9', '#faf4e5', '#e9dfc7', '#e7ddc5', '#b7a88a', '#3c3024', '#695a47', '#704a25', '#75442e', '#405a37'] },
  { id: 'newsroom', name: 'Newsroom', description: '报纸编辑室 · 衬线与细线', colors: ['#eeece5', '#f8f6ef', '#e2dfd5', '#dedbd1', '#a5a195', '#252520', '#59584f', '#414b3d', '#723f36', '#405c48'] },
  { id: 'phosphor-terminal', name: 'Phosphor Terminal', description: '荧光终端 · 墨绿与琥珀', colors: ['#101a16', '#14231c', '#0c1510', '#1b3025', '#42644e', '#d0ebd5', '#a2c8ad', '#a5e5b0', '#ebc995', '#b4de9c'] },
  { id: 'aurora-glass', name: 'Aurora Glass', description: '极光玻璃 · 烟灰与通透', colors: ['#202a35', '#293441', '#1c2530', '#334151', '#617084', '#edf1fa', '#c0ccdf', '#b5d6eb', '#d9c4eb', '#b7dfcf'] },
] as const
export const WORKBENCH_THEMES = [...CLASSIC_THEMES, ...IMMERSIVE_SKINS] as const
export const isImmersiveSkin = (theme: WorkbenchTheme) => IMMERSIVE_SKINS.some(option => option.id === theme)
const tokenNames = ['background', 'surface', 'sidebar', 'raised', 'border', 'text', 'muted', 'accent', 'keyword', 'string'] as const

export function workbenchThemeName(theme: WorkbenchTheme) {
  return WORKBENCH_THEMES.find(option => option.id === theme)?.name ?? '跟随全局外观'
}

export function workbenchThemeStyle(theme: WorkbenchTheme, strength = 0.6): CSSProperties {
  const palette = WORKBENCH_THEMES.find(option => option.id === theme)
  if (!palette) return {}
  const [, , , , , text, muted, accent, keyword, string] = palette.colors
  const paper = theme === 'butter-paper', news = theme === 'newsroom', terminal = theme === 'phosphor-terminal', glass = theme === 'aurora-glass'
  return {
    ...Object.fromEntries(tokenNames.map((name, index) => [`--wb-${name}`, palette.colors[index]])),
    '--wb-heading': accent, '--wb-heading-secondary': keyword, '--wb-emphasis': keyword,
    '--wb-inline-code': string, '--wb-link': accent, '--wb-syntax-comment': muted,
    '--wb-syntax-number': keyword, '--wb-syntax-function': accent, '--wb-syntax-type': string,
    '--wb-syntax-operator': text,
    '--wb-body-font': theme === 'terminal-hacker' ? 'var(--font-mono, ui-monospace, Consolas, monospace)' : 'var(--font-sans, system-ui, sans-serif)',
    '--wb-heading-weight': theme === 'cyberpunk' ? '700' : theme === 'terminal-hacker' ? '500' : '600',
    '--wb-scheme': theme === 'butter-paper' || theme === 'newsroom' ? 'light' : 'dark',
    '--wb-material-strength': String(Math.max(0, Math.min(1, strength))),
    '--wb-composer-filter': glass && strength > 0 ? 'blur(6px)' : 'none',
    '--wb-composer-opacity': glass ? 'calc(100% - 6% * var(--wb-material-strength))' : '100%',
    '--wb-heading-font': theme === 'newsroom' ? 'Georgia, "Noto Serif SC", "Songti SC", SimSun, serif' : 'inherit',
    '--wb-message-surface': theme === 'butter-paper' ? '#faf4e5' : theme === 'aurora-glass' ? '#293441' : 'transparent',
    '--wb-composer-surface': isImmersiveSkin(theme) ? palette.colors[1] : palette.colors[0],
    '--wb-code-surface': palette.colors[2],
    '--wb-tool-surface': theme === 'newsroom' ? palette.colors[0] : palette.colors[2],
    '--wb-message-radius': news || terminal ? '2px' : isImmersiveSkin(theme) ? '8px' : '0px',
    '--wb-code-radius': news || terminal ? '2px' : '8px',
    '--wb-tool-radius': news || terminal ? '2px' : '6px',
    '--wb-material-shadow': paper ? '0 2px 4px rgb(60 48 36 / calc(.08 * var(--wb-material-strength)))' : glass ? 'inset 0 1px rgb(255 255 255 / calc(.12 * var(--wb-material-strength)))' : 'none',
    '--wb-canvas-texture': paper ? 'repeating-linear-gradient(8deg, transparent 0 5px, rgb(112 74 37 / calc(.035 * var(--wb-material-strength))) 5px 6px)' : news ? 'repeating-linear-gradient(90deg, transparent 0 79px, rgb(37 37 32 / calc(.025 * var(--wb-material-strength))) 79px 80px)' : terminal ? 'repeating-linear-gradient(0deg, transparent 0 3px, rgb(165 229 176 / calc(.025 * var(--wb-material-strength))) 3px 4px)' : glass ? 'radial-gradient(ellipse at 0 0, rgb(121 159 172 / calc(.18 * var(--wb-material-strength))), transparent 65%), radial-gradient(ellipse at 100% 100%, rgb(149 132 178 / calc(.14 * var(--wb-material-strength))), transparent 60%)' : 'none',
    '--wb-message-edge': paper ? 'inset 2px 0 rgb(112 74 37 / calc(.24 * var(--wb-material-strength)))' : news ? 'inset 0 1px rgb(37 37 32 / calc(.45 * var(--wb-material-strength)))' : terminal ? 'inset 2px 0 rgb(165 229 176 / calc(.25 * var(--wb-material-strength)))' : glass ? 'inset 0 1px rgb(255 255 255 / calc(.18 * var(--wb-material-strength)))' : 'none',
    '--wb-code-edge': paper ? 'inset 0 1px rgb(112 74 37 / calc(.15 * var(--wb-material-strength)))' : news ? 'inset 3px 0 rgb(37 37 32 / calc(.4 * var(--wb-material-strength)))' : terminal ? 'inset 0 2px rgb(165 229 176 / calc(.4 * var(--wb-material-strength)))' : glass ? 'inset 0 1px rgb(181 214 235 / calc(.25 * var(--wb-material-strength)))' : 'none',
  } as CSSProperties
}

function readAppearance(userId?: number): { theme: WorkbenchTheme; strength: number } {
  try {
    const stored = localStorage.getItem(prefix + (userId ?? 'local'))
    const value = stored?.startsWith('{') ? JSON.parse(stored) : { theme: stored, strength: 0.6 }
    if (value.theme === 'inherit' || WORKBENCH_THEMES.some(option => option.id === value.theme)) {
      return { theme: value.theme, strength: typeof value.strength === 'number' && Number.isFinite(value.strength) ? Math.max(0, Math.min(1, value.strength)) : 0.6 }
    }
  } catch { /* 不能读取时使用产品默认；保存失败由选择器明确显示。 */ }
  return { theme: 'tokyo-night', strength: 0.6 }
}
export function readWorkbenchTheme(userId?: number): WorkbenchTheme { return readAppearance(userId).theme }
export function readWorkbenchMaterialStrength(userId?: number) { return readAppearance(userId).strength }

const trials = new Map<string | number, { owner: symbol; theme: WorkbenchTheme; strength: number }>()
function notifyAppearance() {
  window.dispatchEvent(new Event(readingChangeEvent))
  window.dispatchEvent(new Event(changeEvent))
}
/** 临时试用只在当前页面内广播，关闭/卸载即释放，不写入账号偏好。 */
export function previewWorkbenchTheme(owner: symbol, theme: WorkbenchTheme, strength: number, userId?: number) {
  trials.set(userId ?? 'local', { owner, theme, strength })
  notifyAppearance()
}
export function clearWorkbenchPreview(owner: symbol, userId?: number) {
  if (trials.get(userId ?? 'local')?.owner !== owner) return
  trials.delete(userId ?? 'local')
  notifyAppearance()
}

export function setWorkbenchTheme(theme: WorkbenchTheme, userId = getUser()?.userId, strength = readWorkbenchMaterialStrength(userId)) {
  if (theme !== 'inherit' && !WORKBENCH_THEMES.some(option => option.id === theme)) throw new Error('未知工作台主题')
  localStorage.setItem(prefix + (userId ?? 'local'), JSON.stringify({ theme, strength: Math.max(0, Math.min(1, strength)) }))
  notifyAppearance()
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key?.startsWith(prefix)) listener() }
  window.addEventListener(changeEvent, listener)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener('storage', onStorage) }
}

export function useWorkbenchTheme() {
  const { user } = useAuth()
  return useSyncExternalStore(subscribe, () => trials.get(user?.userId ?? 'local')?.theme ?? readWorkbenchTheme(user?.userId), () => 'tokyo-night' as const)
}
export function useWorkbenchMaterialStrength() {
  const { user } = useAuth()
  return useSyncExternalStore(subscribe, () => trials.get(user?.userId ?? 'local')?.strength ?? readWorkbenchMaterialStrength(user?.userId), () => 0.6)
}

/** 仅普通会话路由挂载时覆盖 Shell/Portal；卸载恢复原外观，悬浮窗只使用自身作用域。 */
export function useWorkbenchPageTheme(theme: WorkbenchTheme) {
  const strength = useWorkbenchMaterialStrength()
  useLayoutEffect(() => {
    if (theme === 'inherit') return
    const root = document.documentElement
    const previousAttribute = root.getAttribute('data-workbench-theme')
    const style = workbenchThemeStyle(theme, strength) as Record<string, string>
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
  }, [theme, strength])
}
