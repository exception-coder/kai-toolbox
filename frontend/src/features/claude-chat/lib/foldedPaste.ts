export interface FoldedPaste {
  raw: string
  start: number
  end: number
  separatorLength: number
}

export function shouldFoldPaste(text: string): boolean {
  return text.length >= 2000 || (text.length >= 500 && text.split('\n').length >= 20)
}

export function visibleDraft(raw: string, fold: FoldedPaste | null): string {
  return fold ? raw.slice(0, fold.start) + raw.slice(fold.end + fold.separatorLength) : raw
}

/** Keep the paragraph boundary in the sent draft and outside the visible editor. */
export function foldPaste(raw: string, start: number, end: number): FoldedPaste {
  const before = raw.slice(0, end)
  const after = raw.slice(end)
  const trailing = before.match(/(?:\r?\n[ \t]*){1,2}$/)?.[0] ?? ''
  const leading = after.match(/^(?:[ \t]*\r?\n){1,2}/)?.[0] ?? ''
  const lineBreaks = (trailing + leading).split('\n').length - 1
  const separator = after.trim() ? '\n'.repeat(Math.max(0, 2 - lineBreaks)) : ''
  return { raw: before + separator + after, start, end, separatorLength: separator.length }
}

export function rawFoldedCaret(caret: number, fold: FoldedPaste | null): number {
  return fold && caret >= fold.start ? caret + fold.end - fold.start + fold.separatorLength : caret
}

/** Edits to visible text never implicitly delete the collapsed text. */
export function editVisibleDraft(raw: string, fold: FoldedPaste | null, start: number, end: number, text: string) {
  const visible = visibleDraft(raw, fold)
  const next = visible.slice(0, start) + text + visible.slice(end)
  if (!fold) return { raw: next, fold: null, insertion: start }
  const hidden = raw.slice(fold.start, fold.end)
  const position = end <= fold.start && start < fold.start
    ? fold.start + text.length - (end - start)
    : start >= fold.start ? fold.start : start + text.length
  const updated = foldPaste(next.slice(0, position) + hidden + next.slice(position), position, position + hidden.length)
  return {
    raw: updated.raw,
    fold: updated,
    insertion: start >= fold.start ? start + hidden.length + updated.separatorLength : start,
  }
}

export function changedRange(previous: string, next: string) {
  let start = 0
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++
  let end = previous.length
  let nextEnd = next.length
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) { end--; nextEnd-- }
  return { start, end, text: next.slice(start, nextEnd) }
}
