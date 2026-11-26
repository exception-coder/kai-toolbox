import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComposerTextarea } from './ComposerTextarea'
import { loadDrafts, saveDrafts, useDraft } from '../lib/draftPref'

afterEach(cleanup)
const longMarkdown = '# 设计说明\n' + '保留完整 Markdown **原文**。\n'.repeat(110)
function mountPaste(initial = '', onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>) {
  function Form() {
    const [draft, setDraft] = useState(initial)
    const [scope, setScope] = useState('session-1')
    return <>
      <ComposerTextarea value={draft} draftScope={scope} onValueChange={setDraft} onPaste={onPaste}
        onAcceptSuggestion={vi.fn()} onDismissSuggestion={vi.fn()} />
      <output data-testid="raw-draft">{draft}</output>
      <button onClick={() => setDraft('')}>发送并清空</button>
      <button onClick={() => setScope('session-2')}>切换会话</button>
    </>
  }
  render(<Form />)
  return screen.getByRole('textbox') as HTMLTextAreaElement
}
function paste(input: HTMLTextAreaElement, text = longMarkdown, files: File[] = []) {
  fireEvent.paste(input, { clipboardData: { getData: () => text, files } })
}

it('persists the original text through the shared draft store and restores it after remount', () => {
  const original = loadDrafts()
  function SharedForm() {
    const [draft, setDraft] = useDraft('test-folded-paste')
    return <ComposerTextarea value={draft} onValueChange={setDraft} draftScope="test-folded-paste"
      onAcceptSuggestion={vi.fn()} onDismissSuggestion={vi.fn()} />
  }
  try {
    const view = render(<SharedForm />)
    paste(screen.getByRole('textbox') as HTMLTextAreaElement)
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(loadDrafts()['test-folded-paste']).toBe(longMarkdown)
    window.dispatchEvent(new Event('pagehide'))
    view.unmount()
    render(<SharedForm />)
    expect(screen.getByRole('textbox')).toHaveValue(longMarkdown)
  } finally { cleanup(); saveDrafts(original) }
})

it.each(['', '\n', '\n\n'])('appends instructions as a new paragraph when the pasted text ends in %j', ending => {
  const input = mountPaste()
  const document = longMarkdown.trimEnd() + ending
  paste(input, document)
  expect(input).toHaveValue('')
  expect(screen.getByTestId('raw-draft').textContent).toBe(document)
  expect(screen.getByRole('button', { name: '在文本框中显示粘贴的长文本' })).toHaveTextContent('设计说明')
  fireEvent.change(input, { target: { value: '请总结' } })
  expect(input).toHaveValue('请总结')
  expect(screen.getByTestId('raw-draft').textContent).toBe(longMarkdown + '\n请总结')
  fireEvent.click(screen.getByRole('button', { name: '在文本框中显示粘贴的长文本' }))
  expect(input).toHaveValue(longMarkdown + '\n请总结')
})

it('preserves selected insertion order, surrounding text and deletes only the folded block', () => {
  const input = mountPaste('前文替换后文')
  input.setSelectionRange(2, 4)
  paste(input)
  expect(input).toHaveValue('前文后文')
  expect(screen.getByTestId('raw-draft').textContent).toBe('前文' + longMarkdown + '\n后文')
  fireEvent.click(screen.getByRole('button', { name: '删除粘贴的长文本' }))
  expect(input).toHaveValue('前文后文')
  expect(screen.getByTestId('raw-draft').textContent).toBe('前文后文')
})

it('keeps collapsed text when replacing all visible instructions and preserves repeated pastes', () => {
  const input = mountPaste('前后')
  input.setSelectionRange(1, 1)
  paste(input)
  fireEvent.change(input, { target: { value: '新说明' } })
  expect(screen.getByTestId('raw-draft').textContent).toBe('新说明' + longMarkdown)
  input.setSelectionRange(3, 3)
  paste(input)
  expect(screen.getByTestId('raw-draft').textContent).toBe('新说明' + longMarkdown + '\n' + longMarkdown)
  fireEvent.click(screen.getByRole('button', { name: '在文本框中显示粘贴的长文本' }))
  expect(input).toHaveValue('新说明' + longMarkdown + '\n' + longMarkdown)
})

it('clears projection on send or session change and leaves file/short pastes to the native handler', () => {
  const handler = vi.fn()
  const input = mountPaste('', handler)
  paste(input, '短文本')
  expect(screen.queryByRole('button', { name: '删除粘贴的长文本' })).toBeNull()
  paste(input, longMarkdown, [new File(['image'], 'test.png')])
  expect(screen.queryByRole('button', { name: '删除粘贴的长文本' })).toBeNull()
  paste(input)
  fireEvent.click(screen.getByText('切换会话'))
  expect(input).toHaveValue(longMarkdown)
  fireEvent.click(screen.getByText('发送并清空'))
  expect(input).toHaveValue('')
  expect(screen.queryByRole('button', { name: '删除粘贴的长文本' })).toBeNull()
  expect(handler).toHaveBeenCalledTimes(3)
})

function mount(onSend = vi.fn(), onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>, compact = false,
               initialSuggestion = '请检查本轮修改并说明验证结果') {
  const accept = vi.fn()
  function Form() {
    const [draft, setDraft] = useState('')
    const [suggestion, setSuggestion] = useState<string | null>(initialSuggestion)
    return <form onSubmit={event => { event.preventDefault(); onSend() }}>
      <ComposerTextarea compact={compact} aria-label="消息输入" placeholder="输入消息…" rows={1} value={draft}
        suggestion={suggestion} onChange={event => setDraft(event.target.value)}
        onAcceptSuggestion={text => { accept(text); setDraft(text); setSuggestion(null) }}
        onDismissSuggestion={() => setSuggestion(null)}
        onKeyDown={event => { onKeyDown?.(event); if (event.key === 'Enter' && !event.defaultPrevented) onSend() }} />
    </form>
  }
  render(<Form />)
  return { input: screen.getByRole('textbox'), accept, onSend }
}

it('shows the complete multiline mobile suggestion and lets a tap fill the draft without sending', () => {
  const suggestion = '请先核对状态。\n再说明剩余问题及下一步。'.repeat(20)
  const { input, accept, onSend } = mount(undefined, undefined, true, suggestion)
  const preview = screen.getByRole('group', { name: '续问建议' })
  expect(preview.querySelector('.cc-composer-suggestion-text')?.textContent).toBe(suggestion)
  expect(input).toHaveValue('')
  expect(input).toHaveAttribute('placeholder', '输入消息…')
  expect(input).toHaveAttribute('rows', '1')
  fireEvent.click(screen.getByRole('button', { name: '采纳续问建议' }))
  expect(input).toHaveValue(suggestion)
  expect(accept).toHaveBeenCalledExactlyOnceWith(suggestion)
  expect(onSend).not.toHaveBeenCalled()
  expect(preview).not.toBeInTheDocument()
})

it('lets mobile users dismiss a suggestion while keeping their draft empty', () => {
  const { input, accept, onSend } = mount(undefined, undefined, true)
  fireEvent.click(screen.getByRole('button', { name: '关闭续问建议' }))
  expect(input).toHaveValue('')
  expect(screen.queryByRole('group', { name: '续问建议' })).not.toBeInTheDocument()
  expect(accept).not.toHaveBeenCalled()
  expect(onSend).not.toHaveBeenCalled()
})

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
