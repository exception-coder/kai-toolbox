import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { QueuedList } from './QueuedList'
import type { QueuedMessage } from '../hooks/useClaudeChatSocket'

afterEach(cleanup)
const message = (id: string, deliveryState?: string): QueuedMessage => ({ id, ownerSessionId: 'original', text: `消息 ${id}`, createdAt: 1, deliveryState })
function setup(items = [message('first')]) {
  const onClear = vi.fn(), onRemove = vi.fn(), onSendNow = vi.fn()
  const content = (next = items) => <ConfirmProvider><QueuedList compact items={next} onClear={onClear} onRemove={onRemove} onSendNow={onSendNow} /></ConfirmProvider>
  const view = render(content())
  return { ...view, content, onClear, onRemove, onSendNow }
}
async function requestClear() {
  fireEvent.click(screen.getByText('更多'))
  fireEvent.click(screen.getByRole('button', { name: '清空队列' }))
  await screen.findByRole('dialog', { name: '清空待发送队列？' })
}
it('cancelling bulk clear preserves messages and never dispatches', async () => {
  const view = setup()
  await requestClear()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(view.onClear).not.toHaveBeenCalled()
  expect(view.onSendNow).not.toHaveBeenCalled()
  expect(screen.getByText('消息 first')).toBeVisible()
})
it('does not clear unseen new messages or tasks that started while confirmation was open', async () => {
  const view = setup()
  await requestClear()
  view.rerender(view.content([message('first', 'DISPATCHING'), message('new')]))
  fireEvent.click(screen.getByRole('button', { name: '确认清空' }))
  await screen.findByText('队列已更新，请重新核对后清空。')
  expect(view.onClear).not.toHaveBeenCalled()
  expect(view.onSendNow).not.toHaveBeenCalled()
})
it('a confirmation belonging to a closed control panel cannot clear the old session', async () => {
  const view = setup()
  await requestClear()
  view.rerender(<ConfirmProvider><p>已关闭面板</p></ConfirmProvider>)
  fireEvent.click(screen.getByRole('button', { name: '确认清空' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(view.onClear).not.toHaveBeenCalled()
})
it('allows deletion of dispatched, failed and uncertain messages without dispatching them', async () => {
  const view = setup([message('sending', 'DISPATCHING'), message('failed', 'FAILED'), message('unknown', 'UNKNOWN')])
  expect(screen.getByText('发送中')).toBeVisible()
  expect(screen.getByText('发送或执行失败 · 请核对')).toBeVisible()
  expect(screen.getByText('派发结果待核对')).toBeVisible()
  const remove = screen.getAllByRole('button', { name: '移除' })
  expect(remove[0]).toBeEnabled(); expect(remove[2]).toBeEnabled()
  fireEvent.click(remove[1])
  expect(view.onRemove).toHaveBeenCalledExactlyOnceWith('failed')
  await waitFor(() => expect(remove[0]).toBeEnabled())
  fireEvent.click(screen.getByText('更多'))
  expect(screen.getByRole('button', { name: '清空队列' })).toBeEnabled()
})

it('gives the pinned blocked inquiry separate stop and delete actions', async () => {
  const onStop = vi.fn(), onRemove = vi.fn(), onSendNow = vi.fn()
  render(<ConfirmProvider><QueuedList compact items={[message('blocked', 'BLOCKED'), message('next')]}
    onStop={onStop} onRemove={onRemove} onSendNow={onSendNow} onClear={vi.fn()} /></ConfirmProvider>)
  fireEvent.click(screen.getByRole('button', { name: '终止询问' }))
  expect(onStop).toHaveBeenCalledExactlyOnceWith('blocked')
  await waitFor(() => expect(screen.getAllByRole('button', { name: '移除' })[0]).toBeEnabled())
  fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0])
  expect(onRemove).toHaveBeenCalledExactlyOnceWith('blocked')
  expect(onSendNow).not.toHaveBeenCalled()
})

it('keeps cancelled work paused and offers sending only when the session can send', () => {
  const onStop = vi.fn(), onSendNow = vi.fn()
  const view = render(<QueuedList items={[message('next', 'CANCELLED')]} onStop={onStop} onRemove={vi.fn()}
    onSendNow={onSendNow} onClear={vi.fn()} canSendNow={false} />)
  expect(screen.queryByRole('button', { name: '终止询问' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  view.rerender(<QueuedList items={[message('next', 'CANCELLED')]} onStop={onStop} onRemove={vi.fn()}
    onSendNow={onSendNow} onClear={vi.fn()} canSendNow />)
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(onSendNow).toHaveBeenCalledExactlyOnceWith('next')
})
