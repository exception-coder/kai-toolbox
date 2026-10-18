import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComposerFileDropZone } from './ComposerFileDropZone'

afterEach(cleanup)
const file = new File(['说明'], '设计说明.docx')
const transfer = () => ({ types: ['Files'], files: [file], items: [], dropEffect: 'none' })

it('adds a dropped file batch exactly once, keeps nested highlighting stable and preserves the draft', () => {
  const onFiles = vi.fn()
  render(<ComposerFileDropZone sessionId="a" onFiles={onFiles} data-testid="drop"><textarea aria-label="草稿" defaultValue="原草稿" /></ComposerFileDropZone>)
  const zone = screen.getByTestId('drop'), input = screen.getByRole('textbox'), dataTransfer = transfer()
  fireEvent.dragEnter(zone, { dataTransfer })
  fireEvent.dragEnter(input, { dataTransfer })
  fireEvent.dragLeave(input, { dataTransfer })
  expect(screen.getByRole('status')).toHaveTextContent('松开即可添加附件')
  const event = createEvent.drop(input, { dataTransfer })
  fireEvent(input, event)
  expect(event.defaultPrevented).toBe(true)
  expect(onFiles).toHaveBeenCalledExactlyOnceWith([file])
  expect(screen.getByRole('textbox')).toHaveValue('原草稿')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('rejects disabled and directory drops and protects outside file drops without consuming text or links', () => {
  const onFiles = vi.fn()
  const view = render(<ComposerFileDropZone sessionId="a" onFiles={onFiles} disabledReason="附件已满" data-testid="drop" />)
  fireEvent.drop(screen.getByTestId('drop'), { dataTransfer: transfer() })
  expect(screen.getByRole('alert')).toHaveTextContent('附件已满')
  const outside = createEvent.drop(window, { dataTransfer: transfer() })
  fireEvent(window, outside)
  expect(outside.defaultPrevented).toBe(true)
  view.rerender(<ComposerFileDropZone sessionId="a" onFiles={onFiles} data-testid="drop" />)
  fireEvent.drop(screen.getByTestId('drop'), { dataTransfer: { ...transfer(), items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] } })
  expect(screen.getByRole('alert')).toHaveTextContent('不支持文件夹')
  const text = createEvent.drop(screen.getByTestId('drop'), { dataTransfer: { types: ['text/plain', 'text/uri-list'], files: [] } })
  fireEvent(screen.getByTestId('drop'), text)
  expect(text.defaultPrevented).toBe(false)
  expect(onFiles).not.toHaveBeenCalled()
})

it('resets on window cancellation or session change and ignores late failures from the old session', async () => {
  let fail!: (error: Error) => void
  const onFiles = () => new Promise<void>((_resolve, reject) => { fail = reject })
  const view = render(<ComposerFileDropZone sessionId="a" onFiles={onFiles} data-testid="drop" />)
  fireEvent.dragEnter(screen.getByTestId('drop'), { dataTransfer: transfer() })
  fireEvent.blur(window)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  fireEvent.drop(screen.getByTestId('drop'), { dataTransfer: transfer() })
  view.rerender(<ComposerFileDropZone sessionId="b" onFiles={onFiles} data-testid="drop" />)
  await act(async () => fail(new Error('old failure')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  view.unmount()
  const outside = createEvent.drop(window, { dataTransfer: transfer() })
  fireEvent(window, outside)
  expect(outside.defaultPrevented).toBe(false)
})
