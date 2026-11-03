import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionCommunicationDock } from './SessionCommunicationDock'

vi.mock('./SessionCommunicationWorkspace', () => ({ default: (props: { sessionId: string; readOnly: boolean; onClose: () => void; onReference: (id: string, material: unknown) => Promise<void> }) =>
  <><button onClick={props.onClose}>关闭开发待办</button><button disabled={props.readOnly} onClick={() => void props.onReference(props.sessionId, {})}>引用测试待办</button></> }))
afterEach(cleanup)

it('opens the session workspace without replacing the conversation and restores trigger focus', async () => {
  render(<><input aria-label="对话草稿" defaultValue="保留内容" /><SessionCommunicationDock sessionId="one" sessionTitle="当前项目" readOnly={false} onReference={vi.fn()} /></>)
  const trigger = screen.getByRole('button', { name: '打开开发待办' })
  fireEvent.click(trigger)
  expect(await screen.findByRole('button', { name: '引用测试待办' })).toBeEnabled()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button', { name: '关闭开发待办' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole('textbox', { name: '对话草稿' })).toHaveValue('保留内容')
})

it('references the exact session and keeps the workspace open after referencing', async () => {
  let finish!: () => void
  const onReference = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  render(<SessionCommunicationDock sessionId="two" sessionTitle="其他项目" readOnly={false} onReference={onReference} />)
  fireEvent.click(screen.getByRole('button', { name: '打开开发待办' }))
  fireEvent.click(await screen.findByRole('button', { name: '引用测试待办' }))
  expect(onReference).toHaveBeenCalledWith('two', {})
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  finish()
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeInTheDocument())
})

it('preserves the locked session restriction', async () => {
  render(<SessionCommunicationDock sessionId="locked" sessionTitle="锁定" readOnly onReference={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '打开开发待办' }))
  expect(await screen.findByRole('button', { name: '引用测试待办' })).toBeDisabled()
})
