import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionDuplicationDialog } from './SessionDuplicationDialog'

afterEach(cleanup)

describe('复制会话进度弹窗', () => {
  it('复制中不把 Esc 当成取消，未知结果可关闭并恢复焦点', async () => {
    const onClose = vi.fn()
    const onReturnFocus = vi.fn()
    const { rerender } = render(<SessionDuplicationDialog
      operation={{ sourceSessionId: 'source', authSwitch: false, phase: 'pending' }}
      onClose={onClose} onReturnFocus={onReturnFocus} />)
    const dialog = screen.getByRole('dialog', { name: '正在复制会话配置' })
    expect(screen.getByRole('button', { name: '请稍候…' })).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    rerender(<SessionDuplicationDialog
      operation={{ sourceSessionId: 'source', authSwitch: false, phase: 'unknown', message: '副本可能已经创建，请先检查列表。' }}
      onClose={onClose} onReturnFocus={onReturnFocus} />)
    fireEvent.click(screen.getByRole('button', { name: '我知道了' }))
    expect(onClose).toHaveBeenCalledOnce()
    rerender(<SessionDuplicationDialog operation={null} onClose={onClose} onReturnFocus={onReturnFocus} />)
    await waitFor(() => expect(onReturnFocus).toHaveBeenCalled())
  })

  it('将弹窗挂到原生全屏元素内，避免全屏外的浮层不可见', async () => {
    const surface = document.createElement('div')
    document.body.append(surface)
    const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: surface })
    try {
      render(<SessionDuplicationDialog operation={{ sourceSessionId: 'source', authSwitch: false, phase: 'pending' }}
        onClose={vi.fn()} onReturnFocus={vi.fn()} />)
      await waitFor(() => expect(surface).toContainElement(screen.getByRole('dialog', { name: '正在复制会话配置' })))
    } finally {
      cleanup()
      if (original) Object.defineProperty(document, 'fullscreenElement', original)
      else Reflect.deleteProperty(document, 'fullscreenElement')
      surface.remove()
    }
  })
})
