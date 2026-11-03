export interface FoldedPaste {
  raw: string
  start: number
  end: number
}

export function shouldFoldPaste(text: string): boolean {
  return text.length >= 2000 || (text.length >= 500 && text.split('\n').length >= 20)
}

export function visibleDraft(raw: string, fold: FoldedPaste | null): string {
  return fold ? raw.slice(0, fold.start) + raw.slice(fold.end) : raw
}

/** Edits to visible text never implicitly delete the collapsed text. */
export function editVisibleDraft(raw: string, fold: FoldedPaste | null, start: number, end: number, text: string) {
  const visible = visibleDraft(raw, fold)
  const next = visible.slice(0, start) + text + visible.slice(end)
  if (!fold) return { raw: next, fold: null, caret: start + text.length, insertion: start }
  const hidden = raw.slice(fold.start, fold.end)
  const position = end <= fold.start && start < fold.start
    ? fold.start + text.length - (end - start)
    : start >= fold.start ? fold.start : start + text.length
  const result = next.slice(0, position) + hidden + next.slice(position)
  const caret = start + text.length
  return {
    raw: result,
    fold: { raw: result, start: position, end: position + hidden.length },
    caret: caret >= position ? caret + hidden.length : caret,
    insertion: start >= fold.start ? start + hidden.length : start,
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
