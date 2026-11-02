import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileWorkspaceSwitcher } from './MobileWorkspaceSwitcher'
import { ChatControlModePicker } from './ChatControlModePicker'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
function mount(allowedLlm = true, open = true) {
  const onChange = vi.fn(), onRename = vi.fn()
  render(<MobileWorkspaceSwitcher title="采购报价工作台" status="Codex · 已连接" onRename={onRename}
    control={close => <ChatControlModePicker inline onChoose={close} mode="CODE_AGENT" allowedAgent allowedLlm={allowedLlm} onChange={onChange} />} />)
  const trigger = screen.getByRole('button', { name: /重命名会话/ })
  trigger.focus()
  if (open) fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
  return { trigger, onChange, onRename }
}
const mobile = () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}
it('offers only modes; selecting the current mode dismisses and returns focus', async () => {
  mobile()
  const { trigger, onChange, onRename } = mount()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByRole('button', { name: '开发助手' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '自由对话' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '切换工作空间' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '开发助手' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled(); expect(onRename).not.toHaveBeenCalled()
})
it('closes before changing mode without renaming or offering workspace switching', async () => {
  mobile()
  const { trigger, onChange, onRename } = mount()
  fireEvent.click(screen.getByRole('button', { name: '自由对话' }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('LLM')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onRename).not.toHaveBeenCalled()
  await waitFor(() => expect(trigger).toHaveFocus())
})
it('respects permissions and closes on Escape or desktop resize', async () => {
  const listeners = new Set<() => void>()
  const media = { matches: true, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  const { trigger, onChange } = mount(false)
  expect(screen.getByRole('button', { name: '自由对话' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '自由对话' }))
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.keyDown(trigger, { key: 'ContextMenu' })
  act(() => { media.matches = false; listeners.forEach(cb => cb()) })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
it('a short press renames without opening mode selection', () => {
  mobile(); vi.useFakeTimers()
  const { trigger, onRename } = mount(true, false)
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 })
  act(() => vi.advanceTimersByTime(200))
  fireEvent.pointerUp(trigger); fireEvent.click(trigger)
  act(() => vi.advanceTimersByTime(600))
  expect(onRename).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('a long press opens modes and consumes the release click; the next tap still renames', () => {
  mobile(); vi.useFakeTimers()
  const { trigger, onRename } = mount(true, false)
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 })
  act(() => vi.advanceTimersByTime(500))
  fireEvent.pointerUp(trigger); fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: '对话方式' })).toBeInTheDocument()
  expect(onRename).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 2 }); fireEvent.pointerUp(trigger); fireEvent.click(trigger)
  expect(onRename).toHaveBeenCalledOnce()
})
it('movement or pointer cancellation cancels the delayed mode menu and accidental rename', () => {
  mobile(); vi.useFakeTimers()
  const { trigger, onRename } = mount(true, false)
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(trigger, { pointerId: 1, clientX: 30, clientY: 10 })
  act(() => vi.advanceTimersByTime(600))
  fireEvent.pointerUp(trigger); fireEvent.click(trigger)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(onRename).not.toHaveBeenCalled()
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 2 }); fireEvent.pointerCancel(trigger)
  act(() => vi.advanceTimersByTime(600))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
