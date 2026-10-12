import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeAppearanceSection } from './ThemeAppearanceSection'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_THEME_STATE,
  getThemeSnapshot,
  initTheme,
  resetTheme,
} from './theme'

beforeEach(() => {
  resetTheme()
  localStorage.clear()
  initTheme()
})

afterEach(() => cleanup())

describe('ThemeAppearanceSection', () => {
  it('材质卡支持预览、恢复与点击保存', () => {
    render(<ThemeAppearanceSection />)
    const paper = screen.getByRole('radio', { name: /纸张/ })

    fireEvent.focus(paper)
    expect(document.documentElement.dataset.material).toBe('paper')
    expect(getThemeSnapshot().material).toBe('standard')

    fireEvent.blur(paper)
    expect(document.documentElement.dataset.material).toBe('standard')

    fireEvent.focus(paper)
    fireEvent.click(paper)
    fireEvent.blur(paper)

    expect(getThemeSnapshot().material).toBe('paper')
    expect(document.documentElement.dataset.material).toBe('paper')
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}').material).toBe('paper')
  })

  it('玻璃材质与减少透明效果保持正交偏好', () => {
    render(<ThemeAppearanceSection />)

    fireEvent.click(screen.getByRole('radio', { name: /玻璃/ }))
    fireEvent.click(screen.getByRole('switch', { name: /减少透明效果/ }))

    expect(getThemeSnapshot()).toMatchObject({
      material: 'glass',
      comfort: { reduceTransparency: true },
    })
    expect(document.documentElement.dataset.reduceTransparency).toBe('true')
    expect(screen.getByText(/玻璃偏好已保留/)).toBeInTheDocument()
  })

  it('自绘单选卡支持方向键切换并移动焦点', () => {
    render(<ThemeAppearanceSection />)
    const standard = screen.getByRole('radio', { name: /^标准/ })
    const soft = screen.getByRole('radio', { name: /^柔和/ })

    standard.focus()
    fireEvent.keyDown(standard, { key: 'ArrowRight' })

    expect(getThemeSnapshot().material).toBe('soft')
    expect(soft).toHaveFocus()
    expect(soft).toHaveAttribute('aria-checked', 'true')
  })

  it('应用当前配置保留自定义组合，恢复默认才重置所选外观', () => {
    render(<ThemeAppearanceSection />)
    fireEvent.click(screen.getByRole('radio', { name: /^自然/ }))
    fireEvent.click(screen.getByRole('radio', { name: /琥珀/ }))
    fireEvent.click(screen.getByRole('radio', { name: /^紧凑/ }))
    fireEvent.click(screen.getByRole('switch', { name: /减少动画/ }))
    const selected = getThemeSnapshot()

    fireEvent.click(screen.getByRole('button', { name: '应用当前配置' }))
    expect(getThemeSnapshot()).toEqual(selected)
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toEqual(selected)
    expect(document.documentElement.dataset).toMatchObject({ material: 'natural', density: 'compact', reduceMotion: 'true' })
    expect(screen.getByRole('button', { name: '已应用当前配置' })).toBeDisabled()
    expect(screen.getByText(/自然 · 琥珀 · 紧凑/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /翠绿/ }))
    expect(screen.getByRole('button', { name: '应用当前配置' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(getThemeSnapshot()).toEqual(DEFAULT_THEME_STATE)
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toEqual(DEFAULT_THEME_STATE)
    expect(screen.getByRole('button', { name: '恢复默认' })).toBeDisabled()
  })
})
