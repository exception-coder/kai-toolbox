export const APPEARANCE_VERSION = 2 as const

export type ThemeMode = 'light' | 'dark' | 'black' | 'system'
export type ThemeMaterial = 'standard' | 'soft' | 'paper' | 'glass' | 'ink' | 'natural'
export type ThemeAccent = 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'slate'
export type ThemeDensity = 'compact' | 'comfortable' | 'spacious'

export interface ThemeComfort {
  reduceContrast: boolean
  warmTone: boolean
  reduceTransparency: boolean
  reduceMotion: boolean
}

export interface ThemeState {
  version: typeof APPEARANCE_VERSION
  mode: ThemeMode
  material: ThemeMaterial
  accent: ThemeAccent
  density: ThemeDensity
  comfort: ThemeComfort
}

export type ThemePatch = Partial<Omit<ThemeState, 'version' | 'comfort'>> & {
  comfort?: Partial<ThemeComfort>
}

export const THEME_MODES: ReadonlyArray<{ id: ThemeMode; label: string; description: string }> = [
  { id: 'light', label: '浅色', description: '明亮、清晰的工作画布' },
  { id: 'dark', label: '深色', description: '柔和深色，适合长时间工作' },
  { id: 'black', label: '纯黑 OLED', description: '纯黑画布，降低 OLED 发光面积' },
  { id: 'system', label: '跟随系统', description: '随设备外观自动切换' },
]

export const THEME_MATERIALS: ReadonlyArray<{
  id: ThemeMaterial
  label: string
  description: string
  previewClass: string
}> = [
  { id: 'standard', label: '标准', description: '干净、专业的默认工作台', previewClass: 'appearance-preview-standard' },
  { id: 'soft', label: '柔和', description: '弱化边界，减轻高密度疲劳', previewClass: 'appearance-preview-soft' },
  { id: 'paper', label: '纸张', description: '暖白纸页，适合 PRD 与咨询', previewClass: 'appearance-preview-paper' },
  { id: 'glass', label: '玻璃', description: '功能层通透，内容层保持实体', previewClass: 'appearance-preview-glass' },
  { id: 'ink', label: '墨水', description: '书籍般的长文本阅读体验', previewClass: 'appearance-preview-ink' },
  { id: 'natural', label: '自然', description: '米白与竹灰绿的安静质感', previewClass: 'appearance-preview-natural' },
]

export const THEME_ACCENTS: ReadonlyArray<{ id: ThemeAccent; label: string; swatch: string }> = [
  { id: 'indigo', label: '靛蓝', swatch: 'oklch(0.55 0.21 277)' },
  { id: 'sky', label: '青蓝', swatch: 'oklch(0.55 0.16 230)' },
  { id: 'emerald', label: '翠绿', swatch: 'oklch(0.55 0.15 150)' },
  { id: 'amber', label: '琥珀', swatch: 'oklch(0.62 0.15 70)' },
  { id: 'rose', label: '玫红', swatch: 'oklch(0.55 0.2 10)' },
  { id: 'slate', label: '石墨', swatch: 'oklch(0.5 0.03 264)' },
]

export const THEME_DENSITIES: ReadonlyArray<{ id: ThemeDensity; label: string; description: string }> = [
  { id: 'compact', label: '紧凑', description: '更多信息同时可见' },
  { id: 'comfortable', label: '舒适', description: '平衡空间与效率' },
  { id: 'spacious', label: '宽松', description: '更充足的留白与触控空间' },
]

export const DEFAULT_THEME_STATE: ThemeState = freezeTheme({
  version: APPEARANCE_VERSION,
  mode: 'system',
  material: 'standard',
  accent: 'indigo',
  density: 'comfortable',
  comfort: {
    reduceContrast: false,
    warmTone: false,
    reduceTransparency: false,
    reduceMotion: false,
  },
})

export const APPEARANCE_STORAGE_KEY = 'kai-toolbox:appearance'
const LEGACY_MODE_KEY = 'kai-toolbox:theme-mode'
const LEGACY_ACCENT_KEY = 'kai-toolbox:theme-accent'
const MODE_CLASSES = ['dark', 'theme-black', 'theme-sepia']
const ACCENT_CLASSES = THEME_ACCENTS.map(accent => `accent-${accent.id}`)

let committedTheme = DEFAULT_THEME_STATE
let activePreview: ThemeState | null = null
let mediaQuery: MediaQueryList | null = null
let runtimeListenersReady = false
const subscribers = new Set<() => void>()

export function loadTheme(): ThemeState {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_STATE
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (stored) {
      const normalized = normalizeTheme(JSON.parse(stored))
      if (stored !== JSON.stringify(normalized)) saveTheme(normalized)
      return normalized
    }

    const legacyMode = localStorage.getItem(LEGACY_MODE_KEY)
    const legacyAccent = localStorage.getItem(LEGACY_ACCENT_KEY)
    const migrated = normalizeTheme({ mode: legacyMode, accent: legacyAccent })
    saveTheme(migrated)
    return migrated
  } catch {
    return DEFAULT_THEME_STATE
  }
}

export function getThemeSnapshot(): ThemeState {
  return committedTheme
}

export function getServerThemeSnapshot(): ThemeState {
  return DEFAULT_THEME_STATE
}

export function subscribeTheme(listener: () => void): () => void {
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}

export function applyTheme(state: ThemeState): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const effectiveMode = resolveThemeMode(state.mode)

  root.classList.remove(...MODE_CLASSES, ...ACCENT_CLASSES)
  if (effectiveMode === 'dark') root.classList.add('dark')
  if (effectiveMode === 'black') root.classList.add('dark', 'theme-black')
  root.classList.add(`accent-${state.accent}`)

  root.dataset.mode = effectiveMode
  root.dataset.material = state.material
  root.dataset.density = state.density
  root.dataset.comfortContrast = state.comfort.reduceContrast ? 'reduced' : 'normal'
  root.dataset.comfortWarm = state.comfort.warmTone ? 'true' : 'false'
  root.dataset.reduceTransparency = state.comfort.reduceTransparency ? 'true' : 'false'
  root.dataset.reduceMotion = state.comfort.reduceMotion ? 'true' : 'false'
  root.style.colorScheme = effectiveMode === 'light' ? 'light' : 'dark'

  updateBrowserThemeColor(effectiveMode, state.material)
}

export function updateTheme(patch: ThemePatch): ThemeState {
  const next = mergeTheme(committedTheme, patch)
  committedTheme = next
  activePreview = null
  saveTheme(next)
  applyTheme(next)
  notifySubscribers()
  return next
}

/** 兼容旧调用方：语义等同局部更新，不会用陈旧对象覆盖新维度。 */
export function setTheme(patch: ThemePatch): ThemeState {
  return updateTheme(patch)
}

export function previewTheme(patch: ThemePatch): ThemeState {
  activePreview = mergeTheme(committedTheme, patch)
  applyTheme(activePreview)
  return activePreview
}

export function restoreCommittedTheme(): void {
  activePreview = null
  applyTheme(committedTheme)
}

export function resetTheme(): ThemeState {
  return updateTheme(DEFAULT_THEME_STATE)
}

/** 首屏渲染前调用，避免主题闪烁并建立 system/storage 监听。 */
export function initTheme(): ThemeState {
  committedTheme = loadTheme()
  activePreview = null
  applyTheme(committedTheme)
  ensureRuntimeListeners()
  return committedTheme
}

function mergeTheme(current: ThemeState, patch: ThemePatch): ThemeState {
  return normalizeTheme({
    ...current,
    ...patch,
    comfort: {
      ...current.comfort,
      ...patch.comfort,
    },
  })
}

function normalizeTheme(candidate: unknown): ThemeState {
  const raw = isRecord(candidate) ? candidate : {}
  const rawComfort = isRecord(raw.comfort) ? raw.comfort : {}
  const migratedFromSepia = raw.mode === 'sepia'

  return freezeTheme({
    version: APPEARANCE_VERSION,
    mode: isThemeMode(raw.mode) ? raw.mode : migratedFromSepia ? 'light' : DEFAULT_THEME_STATE.mode,
    material: isThemeMaterial(raw.material) ? raw.material : DEFAULT_THEME_STATE.material,
    accent: isThemeAccent(raw.accent) ? raw.accent : DEFAULT_THEME_STATE.accent,
    density: isThemeDensity(raw.density) ? raw.density : DEFAULT_THEME_STATE.density,
    comfort: {
      reduceContrast: migratedFromSepia || readBoolean(rawComfort.reduceContrast),
      warmTone: migratedFromSepia || readBoolean(rawComfort.warmTone),
      reduceTransparency: readBoolean(rawComfort.reduceTransparency),
      reduceMotion: readBoolean(rawComfort.reduceMotion),
    },
  })
}

function saveTheme(state: ThemeState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(state))
    localStorage.setItem(LEGACY_MODE_KEY, state.mode)
    localStorage.setItem(LEGACY_ACCENT_KEY, state.accent)
  } catch {
    // 隐私模式或存储配额异常时，内存主题仍然可用。
  }
}

function ensureRuntimeListeners(): void {
  if (runtimeListenersReady || typeof window === 'undefined') return
  runtimeListenersReady = true

  if (typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', handleSystemAppearanceChange)
  }
  window.addEventListener('storage', handleStorageChange)
}

function handleSystemAppearanceChange(): void {
  const displayed = activePreview ?? committedTheme
  if (displayed.mode === 'system') applyTheme(displayed)
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== null && ![APPEARANCE_STORAGE_KEY, LEGACY_MODE_KEY, LEGACY_ACCENT_KEY].includes(event.key)) return
  const next = loadTheme()
  if (sameTheme(next, committedTheme)) return
  committedTheme = next
  activePreview = null
  applyTheme(next)
  notifySubscribers()
}

function notifySubscribers(): void {
  subscribers.forEach(listener => listener())
}

function resolveThemeMode(mode: ThemeMode): Exclude<ThemeMode, 'system'> {
  if (mode !== 'system') return mode
  return prefersDark() ? 'dark' : 'light'
}

function prefersDark(): boolean {
  if (mediaQuery) return mediaQuery.matches
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function updateBrowserThemeColor(mode: Exclude<ThemeMode, 'system'>, material: ThemeMaterial): void {
  if (typeof document === 'undefined') return
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) return
  meta.content = browserThemeColor(mode, material)
}

function browserThemeColor(mode: Exclude<ThemeMode, 'system'>, material: ThemeMaterial): string {
  if (mode === 'black') return '#000000'
  if (mode === 'dark') {
    if (material === 'paper' || material === 'ink') return '#171613'
    if (material === 'natural') return '#151914'
    return '#101318'
  }
  if (material === 'paper') return '#edebe5'
  if (material === 'ink') return '#f4f1e9'
  if (material === 'natural') return '#eef0e8'
  return '#f6f7f9'
}

function freezeTheme(state: ThemeState): ThemeState {
  const comfort = Object.freeze({ ...state.comfort })
  return Object.freeze({ ...state, comfort })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some(option => option.id === value)
}

function isThemeMaterial(value: unknown): value is ThemeMaterial {
  return THEME_MATERIALS.some(option => option.id === value)
}

function isThemeAccent(value: unknown): value is ThemeAccent {
  return THEME_ACCENTS.some(option => option.id === value)
}

function isThemeDensity(value: unknown): value is ThemeDensity {
  return THEME_DENSITIES.some(option => option.id === value)
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function sameTheme(left: ThemeState, right: ThemeState): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
