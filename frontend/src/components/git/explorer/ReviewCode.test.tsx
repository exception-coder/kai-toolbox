import { cleanup, render, screen } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewCode } from './ReviewCode'

vi.mock('@/lib/useIsDarkTheme', () => ({ useIsDarkTheme: () => false }))
afterEach(cleanup)

it.each(['source', 'unified', 'split'] as const)('keeps every %s editor read-only without merge action controls', mode => {
  const { container } = render(<ReviewCode path="Example.java" before="class Old {}" after="class New {}" mode={mode} />)
  const editors = container.querySelectorAll<HTMLElement>('.cm-editor')
  expect(editors).toHaveLength(mode === 'split' ? 2 : 1)
  for (const editor of editors) {
    const view = EditorView.findFromDOM(editor)
    expect(view?.state.readOnly).toBe(true)
    expect(editor.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false')
  }
  expect(screen.queryByRole('button', { name: /accept|reject|接受|拒绝/i })).not.toBeInTheDocument()
})
