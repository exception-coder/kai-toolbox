import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OpenSpecInitializationDialog } from './OpenSpecInitializationDialog'

describe('OpenSpecInitializationDialog', () => {
  it('shows the target and requires explicit confirmation', () => {
    const onConfirm = vi.fn()
    render(
      <OpenSpecInitializationDialog
        path="D:/work/demo"
        tool="codex"
        phase="confirming"
        message="当前项目尚未初始化 OpenSpec"
        onConfirm={onConfirm}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('D:/work/demo')).toBeInTheDocument()
    expect(screen.getByText('openspec init . --tools codex')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认并初始化' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('keeps a recovery action when initialization fails', () => {
    render(
      <OpenSpecInitializationDialog
        path="D:/work/demo"
        tool="claude"
        phase="error"
        message="OpenSpec 初始化失败"
        detail="permission denied"
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('OpenSpec 初始化失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新检测' })).toBeInTheDocument()
  })
})
