import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_THEME_STATE,
  getThemeSnapshot,
  initTheme,
  previewTheme,
  resetTheme,
  restoreCommittedTheme,
  updateTheme,
} from './theme'

let systemDark = false
const systemAppearanceListeners = new Set<() => void>()

beforeAll(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    get matches() { return query === '(prefers-color-scheme: dark)' && systemDark },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => systemAppearanceListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => systemAppearanceListeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
})

beforeEach(() => {
  systemDark = false
  resetTheme()
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
  for (const key of Object.keys(document.documentElement.dataset)) {
    delete document.documentElement.dataset[key]
  }
})

describe('appearance store', () => {
  it('把旧护眼模式迁移为浅色舒适度偏好，而不是新材质', () => {
    localStorage.setItem('kai-toolbox:theme-mode', 'sepia')
    localStorage.setItem('kai-toolbox:theme-accent', 'rose')

    const state = initTheme()

    expect(state).toMatchObject({
      mode: 'light',
      material: 'standard',
      accent: 'rose',
      comfort: {
        reduceContrast: true,
        warmTone: true,
      },
    })
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toEqual(state)
  })

  it('局部更新不会用旧快照覆盖其他外观维度', () => {
    initTheme()
    updateTheme({ material: 'paper', comfort: { warmTone: true } })
    updateTheme({ accent: 'emerald' })

    expect(getThemeSnapshot()).toMatchObject({
      material: 'paper',
      accent: 'emerald',
      density: 'comfortable',
      comfort: { warmTone: true },
    })
  })

  it('切换模式时清理旧兼容类并同步语义属性', () => {
    initTheme()
    updateTheme({ mode: 'black', material: 'glass', density: 'compact' })

    expect(document.documentElement).toHaveClass('dark', 'theme-black')
    expect(document.documentElement.dataset).toMatchObject({
      mode: 'black',
      material: 'glass',
      density: 'compact',
    })

    updateTheme({ mode: 'light', material: 'natural' })

    expect(document.documentElement).not.toHaveClass('dark', 'theme-black', 'theme-sepia')
    expect(document.documentElement.dataset.mode).toBe('light')
    expect(document.documentElement.dataset.material).toBe('natural')
  })

  it('悬停预览只改变运行时画面，不写入持久化偏好', () => {
    initTheme()
    const storedBeforePreview = localStorage.getItem(APPEARANCE_STORAGE_KEY)

    previewTheme({ material: 'paper' })

    expect(document.documentElement.dataset.material).toBe('paper')
    expect(getThemeSnapshot().material).toBe('standard')
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(storedBeforePreview)

    restoreCommittedTheme()
    expect(document.documentElement.dataset.material).toBe('standard')
  })

  it('跟随系统时响应系统明暗变化并保留用户偏好', () => {
    initTheme()
    expect(getThemeSnapshot().mode).toBe('system')
    expect(document.documentElement.dataset.mode).toBe('light')

    systemDark = true
    systemAppearanceListeners.forEach(listener => listener())

    expect(document.documentElement.dataset.mode).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(getThemeSnapshot().mode).toBe('system')
  })

  it('损坏的新版偏好安全回退到默认值', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, '{broken')

    expect(initTheme()).toEqual(DEFAULT_THEME_STATE)
  })

  it('跨标签页清空本地存储时恢复默认外观', () => {
    initTheme()
    updateTheme({ mode: 'dark', material: 'glass', accent: 'rose' })
    localStorage.clear()

    window.dispatchEvent(new StorageEvent('storage', { key: null }))

    expect(getThemeSnapshot()).toEqual(DEFAULT_THEME_STATE)
    expect(document.documentElement.dataset.material).toBe('standard')
  })
})
