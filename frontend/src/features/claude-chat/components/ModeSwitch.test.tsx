import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModeSwitch } from './ModeSwitch'

afterEach(cleanup)

describe('ModeSwitch inlineConfirmation', () => {
  it('在原组件 DOM 内确认完全访问权限，取消不提交、确认才提交', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ModeSwitch
        engine="codex"
        mode="default"
        onChange={onChange}
        inlineConfirmation
      />,
    )

    const openModeMenu = () => {
      fireEvent.click(screen.getByRole('button', { name: '权限模式 请求批准，点击切换' }))
      fireEvent.click(screen.getByRole('button', { name: /^完全访问权限/ }))
    }

    openModeMenu()
    const confirmationTitle = screen.getByRole('heading', { name: '开启「完全访问权限」模式？' })
    expect(container).toContainElement(confirmationTitle)

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: '开启「完全访问权限」模式？' })).not.toBeInTheDocument()

    openModeMenu()
    fireEvent.click(screen.getByRole('button', { name: '开启完全访问权限' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('bypassPermissions')
  })
})
