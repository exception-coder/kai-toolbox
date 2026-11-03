import { describe, expect, it } from 'vitest'
import { editVisibleDraft, shouldFoldPaste, visibleDraft } from './foldedPaste'

describe('collapsed text is preserved independently of visible selection', () => {
  const raw = 'abcHIDDENdef'
  const fold = { raw, start: 3, end: 9 }
  it.each([
    [0, 0, '!', '!abcHIDDENdef'],
    [3, 3, '!', 'abcHIDDEN!def'],
    [6, 6, '!', 'abcHIDDENdef!'],
    [0, 3, '!', '!HIDDENdef'],
    [3, 6, '!', 'abcHIDDEN!'],
    [0, 6, '!', '!HIDDEN'],
    [2, 4, '!', 'ab!HIDDENef'],
  ])('maps visible edit %s..%s without losing hidden text', (start, end, text, expected) => {
    const next = editVisibleDraft(raw, fold, start, end, text)
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
