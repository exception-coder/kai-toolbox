import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CodexAuthDirectory } from './CodexAuthDirectory'

afterEach(cleanup)

it('切换授权目录前确认并保留原会话', () => {
  const onChange = vi.fn()
  render(<CodexAuthDirectory current="C:/a" homes={['C:/a', 'C:/b']} onChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Auth 目录' }), { target: { value: 'C:/b' } })
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('当前会话保持不变')
  fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
  expect(onChange).toHaveBeenCalledWith('C:/b')
})

it('授权目录刷新后不能确认已经消失的目录', () => {
  const onChange = vi.fn()
  const view = render(<CodexAuthDirectory current="C:/a" homes={['C:/a', 'C:/b']} onChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Auth 目录' }), { target: { value: 'C:/b' } })
  view.rerender(<CodexAuthDirectory current="C:/a" homes={['C:/a']} onChange={onChange} />)
  expect(screen.queryByRole('button', { name: '创建并切换' })).toBeNull()
  expect(onChange).not.toHaveBeenCalled()
})
