import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { copyRichTextToClipboard, copyTextToClipboard } from './clipboard'

const write = vi.fn()
const execute = vi.fn()
const originalCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')
beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText: write } })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execute })
  write.mockReset(); execute.mockReset()
})
afterEach(() => {
  delete window.ForgeNative
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

it('writes both representations in one clipboard item without fetching or reading the clipboard', async () => {
  const writeRich = vi.fn(async (_items: unknown[]) => {})
  vi.stubGlobal('navigator', { clipboard: { write: writeRich, writeText: write } })
  class Item { constructor(public data: Record<string, Blob>) {} }
  vi.stubGlobal('ClipboardItem', Item)
  expect(await copyRichTextToClipboard('大纲', '<h2>大纲</h2>')).toBe('rich')
  const item = writeRich.mock.calls[0]![0] as Item[]
  expect(Object.keys(item[0]!.data)).toEqual(['text/html', 'text/plain'])
  expect(item[0]!.data['text/html']!.type).toBe('text/html')
  expect(item[0]!.data['text/plain']!.type).toBe('text/plain')
  expect(write).not.toHaveBeenCalled()
})

it('falls back to readable text when rich write is rejected, and reports failure if both fail', async () => {
  vi.stubGlobal('ClipboardItem', class {})
  vi.stubGlobal('navigator', { clipboard: { write: vi.fn().mockRejectedValue(new Error('unsupported')), writeText: write } })
  write.mockResolvedValueOnce(undefined)
  expect(await copyRichTextToClipboard('易读正文', '<p>易读正文</p>')).toBe('readable')
  expect(write).toHaveBeenCalledWith('易读正文')
  write.mockRejectedValueOnce(new Error('denied')); execute.mockReturnValueOnce(false)
  await expect(copyRichTextToClipboard('保留正文', '<p>保留正文</p>')).rejects.toThrow()
})

it('uses the mobile host and never replays a denied native copy through browser clipboard APIs', async () => {
  const postMessage = vi.fn((raw: string) => {
    const request = JSON.parse(raw)
    window.ForgeNative!.onmessage!({ data: JSON.stringify({ id: request.id, ok: false, error: '系统拒绝复制' }) })
  })
  window.ForgeNative = { postMessage }
  await expect(copyTextToClipboard('保持大纲')).rejects.toThrow('系统拒绝复制')
  expect(postMessage).toHaveBeenCalledOnce()
  expect(write).not.toHaveBeenCalled()
  expect(execute).not.toHaveBeenCalled()
})
