import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FocusReadingHeader } from './FocusReadingHeader'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function fixture(width: number) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: width >= 984, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const exit = vi.fn(), toggle = vi.fn(), details = vi.fn()
  const view = render(<FocusReadingHeader title="应用组织权限管理" status="Codex 正在运行" running
    wide={false} onToggleWidth={toggle} onOpenDetails={details} onExit={exit} />)
  return { ...view, exit, toggle, details }
}
it('keeps mobile navigation minimal and puts details in a recoverable popover', () => {
  const { exit, details } = fixture(390)
  expect(screen.getByRole('heading', { name: '应用组织权限管理' })).toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Codex 正在运行' })).toBeInTheDocument()
  expect(screen.queryByText(/OpenSpec/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '宽版阅读' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '阅读与会话选项' }))
  expect(screen.queryByRole('button', { name: '宽版阅读' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '运行详情' }))
  expect(details).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '返回工作台' }))
  expect(exit).toHaveBeenCalledOnce()
})
it('only offers wider reading on a sufficiently wide viewport', () => {
  const { toggle } = fixture(1280)
  expect(screen.queryByRole('button', { name: '宽版阅读' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '阅读与会话选项' }))
  fireEvent.click(screen.getByRole('button', { name: '宽版阅读' }))
  expect(toggle).toHaveBeenCalledOnce()
})
