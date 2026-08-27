import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsultMessageActions } from './ConsultMessageActions'

afterEach(cleanup)

describe('ConsultMessageActions', () => {
  it('移动端默认展示引用和复制操作，并响应触摸点击', () => {
    const onCopy = vi.fn()
    const onQuote = vi.fn()
    const { container } = render(
      <ConsultMessageActions align="start" copied={false} onCopy={onCopy} onQuote={onQuote} />,
    )

    expect(container.firstElementChild).toHaveClass('opacity-100', 'sm:opacity-0', 'sm:group-focus-within:opacity-100')
    fireEvent.click(screen.getByRole('button', { name: '引用' }))
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(onQuote).toHaveBeenCalledOnce()
    expect(onCopy).toHaveBeenCalledOnce()
  })

  it('复制完成后提供明确反馈', () => {
    render(<ConsultMessageActions align="end" copied onCopy={vi.fn()} onQuote={vi.fn()} />)
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument()
  })
})
