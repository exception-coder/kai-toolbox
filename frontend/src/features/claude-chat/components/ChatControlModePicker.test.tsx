import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatControlModePicker } from './ChatControlModePicker'

afterEach(cleanup)

it('opens a descriptive choice, shows the current mode and restores keyboard focus on escape', async () => {
  const onChange = vi.fn()
  render(<ChatControlModePicker mode="CODE_AGENT" allowedAgent allowedLlm onChange={onChange} />)
  const trigger = screen.getByRole('button', { name: '切换对话方式，当前开发助手' })
  trigger.focus()
  fireEvent.click(trigger)
  expect(screen.getByRole('button', { name: '开发助手' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('问答、写作与内容创作')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
})

it('explains unavailable access and does not select a disabled mode', () => {
  const onChange = vi.fn()
  render(<ChatControlModePicker mode="CODE_AGENT" allowedAgent allowedLlm={false} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: /切换对话方式/ }))
  expect(screen.getByText('当前账号暂无此权限')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '自由对话' }))
  expect(onChange).not.toHaveBeenCalled()
})
