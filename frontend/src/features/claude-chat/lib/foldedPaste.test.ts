import { describe, expect, it } from 'vitest'
import { editVisibleDraft, foldPaste, shouldFoldPaste, visibleDraft } from './foldedPaste'

describe('collapsed text is preserved independently of visible selection', () => {
  const fold = foldPaste('abcHIDDENdef', 3, 9)
  it.each([
    [0, 0, '!', '!abcHIDDEN\n\ndef'],
    [3, 3, '!', 'abcHIDDEN\n\n!def'],
    [6, 6, '!', 'abcHIDDEN\n\ndef!'],
    [0, 3, '!', '!HIDDEN\n\ndef'],
    [3, 6, '!', 'abcHIDDEN\n\n!'],
    [0, 6, '!', '!HIDDEN'],
    [2, 4, '!', 'ab!HIDDEN\n\nef'],
  ])('maps visible edit %s..%s without losing hidden text', (start, end, text, expected) => {
    const next = editVisibleDraft(fold.raw, fold, start, end, text)
    expect(next.raw).toBe(expected)
    expect(next.raw.slice(next.fold!.start, next.fold!.end)).toBe('HIDDEN')
    expect(next.raw.slice(next.insertion, next.insertion + text.length)).toBe(text)
    expect(visibleDraft(next.raw, next.fold)).toBe('abcdef'.slice(0, start) + text + 'abcdef'.slice(end))
  })
  it('folds only large text, without requiring Markdown syntax detection', () => {
    expect(shouldFoldPaste('# Title\nshort')).toBe(false)
    expect(shouldFoldPaste('\n'.repeat(40))).toBe(false)
    expect(shouldFoldPaste('a'.repeat(2000))).toBe(true)
    expect(shouldFoldPaste(('a'.repeat(30) + '\n').repeat(20))).toBe(true)
  })
})
