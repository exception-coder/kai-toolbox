import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComposerTextarea } from './ComposerTextarea'

afterEach(cleanup)
function mount(onSend = vi.fn(), onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>) {
  const accept = vi.fn()
  function Form() {
    const [draft, setDraft] = useState('')
    const [suggestion, setSuggestion] = useState<string | null>('请检查本轮修改并说明验证结果')
    return <form onSubmit={event => { event.preventDefault(); onSend() }}>
      <ComposerTextarea aria-label="消息输入" placeholder="输入消息…" rows={1} value={draft}
        suggestion={suggestion} onChange={event => setDraft(event.target.value)}
        onAcceptSuggestion={text => { accept(text); setDraft(text); setSuggestion(null) }}
        onDismissSuggestion={() => setSuggestion(null)}
        onKeyDown={event => { onKeyDown?.(event); if (event.key === 'Enter' && !event.defaultPrevented) onSend() }} />
    </form>
  }
  render(<Form />)
  return { input: screen.getByRole('textbox'), accept, onSend }
}

it('shows preview in gray placeholder and Tab fills an editable draft without sending', () => {
  const { input, accept, onSend } = mount()
  expect(input).toHaveValue('')
  expect(input).toHaveAttribute('placeholder', '请检查本轮修改并说明验证结果')
  fireEvent.keyDown(input, { key: 'Tab' })
  expect(input).toHaveValue('请检查本轮修改并说明验证结果')
  expect(accept).toHaveBeenCalledOnce()
  expect(onSend).not.toHaveBeenCalled()
})

it('leaves IME, Shift+Tab and completion-menu handling ahead of suggestion acceptance', () => {
  const onKeyDown = vi.fn(event => { if (event.altKey) event.preventDefault() })
  const { input, accept, onSend } = mount(undefined, onKeyDown)
  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
  fireEvent.keyDown(input, { key: 'Tab', altKey: true })
  fireEvent.compositionStart(input)
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  fireEvent.keyDown(input, { key: 'Tab', isComposing: true })
  fireEvent.compositionEnd(input)
  expect(accept).not.toHaveBeenCalled()
  expect(onSend).not.toHaveBeenCalled()
})

it('supports touch acceptance and dismisses the preview after the user types or presses Escape', () => {
  const first = mount()
  fireEvent.click(screen.getByRole('button', { name: '采纳续问建议' }))
  expect(first.input).toHaveValue('请检查本轮修改并说明验证结果')
  expect(first.onSend).not.toHaveBeenCalled()
  cleanup()
  const second = mount()
  fireEvent.change(second.input, { target: { value: '我的问题' } })
  expect(screen.queryByRole('button', { name: '采纳续问建议' })).not.toBeInTheDocument()
  fireEvent.keyDown(second.input, { key: 'Tab' })
  expect(second.input).toHaveValue('我的问题')
  cleanup()
  const third = mount()
  fireEvent.keyDown(third.input, { key: 'Escape' })
  expect(third.input).toHaveAttribute('placeholder', '输入消息…')
})
