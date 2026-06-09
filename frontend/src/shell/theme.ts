// App 全局主题：两个正交维度——明暗模式 × 主色。沿用 index.css 的 OKLCH + CSS 变量 token，
// 应用方式 = 在 <html> 上挂覆盖类（dark / theme-black / theme-sepia / accent-*），不动业务组件。

export type ThemeMode = 'light' | 'dark' | 'black' | 'sepia' | 'system'
export type ThemeAccent = 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'slate'

export interface ThemeState {
  mode: ThemeMode
  accent: ThemeAccent
}

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'black', label: '纯黑（OLED）' },
  { id: 'sepia', label: '护眼' },
  { id: 'system', label: '跟随系统' },
]

/** swatch 仅用于菜单里的小色块预览，与 index.css 的 .accent-* 主色对应 */
export const THEME_ACCENTS: { id: ThemeAccent; label: string; swatch: string }[] = [
  { id: 'indigo', label: '靛蓝', swatch: 'oklch(0.55 0.18 264)' },
  { id: 'sky', label: '青蓝', swatch: 'oklch(0.55 0.16 230)' },
  { id: 'emerald', label: '翠绿', swatch: 'oklch(0.55 0.15 150)' },
  { id: 'amber', label: '琥珀', swatch: 'oklch(0.62 0.15 70)' },
  { id: 'rose', label: '玫红', swatch: 'oklch(0.55 0.2 10)' },
  { id: 'slate', label: '石墨', swatch: 'oklch(0.5 0.03 264)' },
]

const MODE_KEY = 'kai-toolbox:theme-mode'
const ACCENT_KEY = 'kai-toolbox:theme-accent'
const MODE_CLASSES = ['dark', 'theme-black', 'theme-sepia']
const ACCENT_CLASSES = THEME_ACCENTS.map(a => `accent-${a.id}`)

export function loadTheme(): ThemeState {
  let mode: ThemeMode = 'system'
  let accent: ThemeAccent = 'indigo'
  try {
    const m = localStorage.getItem(MODE_KEY)
    if (m && THEME_MODES.some(x => x.id === m)) mode = m as ThemeMode
    const a = localStorage.getItem(ACCENT_KEY)
    if (a && THEME_ACCENTS.some(x => x.id === a)) accent = a as ThemeAccent
  } catch {
    /* localStorage 不可用，用默认 */
  }
  return { mode, accent }
}

function saveTheme(state: ThemeState): void {
  try {
    localStorage.setItem(MODE_KEY, state.mode)
    localStorage.setItem(ACCENT_KEY, state.accent)
  } catch {
    /* 静默忽略 */
  }
}

function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 把主题套到 <html>：先清已知主题类（幂等），再按 mode/accent 加类 */
export function applyTheme(state: ThemeState): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove(...MODE_CLASSES, ...ACCENT_CLASSES)

  const effective = state.mode === 'system' ? (prefersDark() ? 'dark' : 'light') : state.mode
  if (effective === 'dark') root.classList.add('dark')
  else if (effective === 'black') root.classList.add('dark', 'theme-black')
  else if (effective === 'sepia') root.classList.add('theme-sepia')
  // light → 不加任何明暗类

  root.classList.add(`accent-${state.accent}`)
}

let mql: MediaQueryList | null = null
let listener: (() => void) | null = null

/** system 模式下实时跟随系统明暗；切走 system 时解除监听 */
function watchSystem(state: ThemeState): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  if (!mql) mql = window.matchMedia('(prefers-color-scheme: dark)')
  if (listener) mql.removeEventListener('change', listener)
  listener = null
  if (state.mode === 'system') {
    listener = () => applyTheme(state)
    mql.addEventListener('change', listener)
  }
}

/** 选择主题：持久化 + 套用 + 维护 system 监听 */
export function setTheme(state: ThemeState): void {
  saveTheme(state)
  applyTheme(state)
  watchSystem(state)
}

/** 启动时套用已存主题（main.tsx 渲染前调用，避免首屏闪烁） */
export function initTheme(): ThemeState {
  const s = loadTheme()
  applyTheme(s)
  watchSystem(s)
  return s
}
