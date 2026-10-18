import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboard'

const write = vi.fn()
const execute = vi.fn()
const originalCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')
beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText: write } })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execute })
  write.mockReset(); execute.mockReset()
})
afterEach(() => {
  document.body.replaceChildren(); window.getSelection()?.removeAllRanges()
  vi.unstubAllGlobals()
  if (originalCommand) Object.defineProperty(document, 'execCommand', originalCommand)
  else Reflect.deleteProperty(document, 'execCommand')
})

it('uses the supported clipboard API without adding a temporary editor', async () => {
  write.mockResolvedValueOnce(undefined)
  await copyTextToClipboard('完整 Markdown')
  expect(write).toHaveBeenCalledExactlyOnceWith('完整 Markdown')
  expect(execute).not.toHaveBeenCalled()
  expect(document.querySelector('textarea')).toBeNull()
})

it('falls back without opening an editable field and restores the original focus and selection', async () => {
  write.mockRejectedValueOnce(new Error('denied'))
  const button = document.createElement('button'), text = document.createElement('p')
  text.textContent = '原选区'; document.body.append(button, text); button.focus()
  const range = document.createRange(); range.selectNodeContents(text)
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range)
  expect(window.getSelection()?.toString()).toBe('原选区')
  execute.mockImplementationOnce(() => {
    const editor = document.querySelector('textarea')!
    expect(editor.value).toBe('完整正文')
    expect(editor.readOnly).toBe(true)
    return true
  })
  await copyTextToClipboard('完整正文')
  expect(execute).toHaveBeenCalledExactlyOnceWith('copy')
  expect(document.querySelector('textarea')).toBeNull()
  expect(document.activeElement).toBe(button)
  expect(window.getSelection()?.toString()).toBe('原选区')
})

it.each(['false', 'throws'])('rejects a %s fallback result and cleans up rather than claiming success', async mode => {
  write.mockRejectedValueOnce(new Error('denied'))
  execute.mockImplementationOnce(() => { if (mode === 'throws') throw new Error('blocked'); return false })
  await expect(copyTextToClipboard('保持原文')).rejects.toThrow()
  expect(document.querySelector('textarea')).toBeNull()
})
