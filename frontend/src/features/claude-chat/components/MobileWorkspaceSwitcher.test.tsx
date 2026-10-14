import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileWorkspaceSwitcher } from './MobileWorkspaceSwitcher'
import { ChatControlModePicker } from './ChatControlModePicker'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function mount(allowedLlm = true) {
  const onChange = vi.fn(), onSwitchWorkspace = vi.fn()
  render(<MobileWorkspaceSwitcher title="采购报价工作台" status="Codex · 已连接" onSwitchWorkspace={onSwitchWorkspace}
    control={close => <ChatControlModePicker inline onChoose={close} mode="CODE_AGENT" allowedAgent allowedLlm={allowedLlm} onChange={onChange} />} />)
  const trigger = screen.getByRole('button', { name: /切换工作空间与对话方式/ })
  trigger.focus(); fireEvent.click(trigger)
  return { trigger, onChange, onSwitchWorkspace }
}

it('offers modes directly without navigation or a nested popup; current mode only dismisses', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const { trigger, onChange } = mount()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByRole('button', { name: '开发助手' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '自由对话' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /切换对话方式/ })).not.toBeInTheDocument()
  for (const name of ['对话', '推进', '看板', '开发待办', '轨迹', '站点', '用量']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: '开发助手' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
})

it('closes before changing mode and reuses the workspace list action', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const { trigger, onChange, onSwitchWorkspace } = mount()
  fireEvent.click(screen.getByRole('button', { name: '自由对话' }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('LLM')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '切换工作空间' }))
  expect(onSwitchWorkspace).toHaveBeenCalledOnce()
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('respects permissions and restores focus on escape or desktop resize', async () => {
  const listeners = new Set<() => void>()
  const media = { matches: true, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  const { trigger, onChange } = mount(false)
  expect(screen.getByRole('button', { name: '自由对话' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '自由对话' }))
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.click(trigger)
  act(() => { media.matches = false; listeners.forEach(cb => cb()) })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
