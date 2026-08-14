import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeAppearanceSection } from './ThemeAppearanceSection'
import {
  APPEARANCE_STORAGE_KEY,
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
})
