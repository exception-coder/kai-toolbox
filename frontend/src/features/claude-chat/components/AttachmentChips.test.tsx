import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentChips } from './AttachmentChips'

afterEach(cleanup)

describe('AttachmentChips', () => {
  it('上传失败后保留错误说明和恢复路径', () => {
    const onDismissError = vi.fn()

    render(
      <AttachmentChips
        items={[]}
        error="当前用户不能访问该会话"
        onDismissError={onDismissError}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText('当前用户不能访问该会话')).toBeInTheDocument()
    expect(screen.getByText('请重新粘贴或选择文件')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭附件上传错误' }))
    expect(onDismissError).toHaveBeenCalledOnce()
  })
})
