import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ImageLightbox } from './ImageLightbox'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function Preview() {
  const [open, setOpen] = useState(false)
  return <div data-testid="consultation-layer">
    <button type="button" onClick={() => setOpen(true)}>查看附件</button>
    {open && <ImageLightbox src="/example.png" alt="业务截图" onClose={() => setOpen(false)} />}
  </div>
}

it('places the visible close action outside the consultation layer and restores focus', async () => {
  render(<Preview />)
  const trigger = screen.getByRole('button', { name: '查看附件' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: '图片预览' })
  expect(screen.getByTestId('consultation-layer')).not.toContainElement(dialog)
  const close = screen.getByRole('button', { name: '关闭图片预览' })
  expect(close).toHaveTextContent('关闭')
  fireEvent.click(close)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})

it('keeps image taps open and supports backdrop and Escape dismissal', () => {
  const onClose = vi.fn()
  const parentKeyDown = vi.fn()
  render(<div onKeyDown={parentKeyDown}><ImageLightbox src="/example.png" onClose={onClose} /></div>)
  fireEvent.click(screen.getByRole('img'))
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('img').parentElement!)
  expect(onClose).toHaveBeenCalledOnce()
  onClose.mockClear()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
  expect(parentKeyDown).not.toHaveBeenCalled()
})

it('keeps preview and its close action inside the native fullscreen element', () => {
  const fullscreen = document.createElement('div')
  document.body.append(fullscreen)
  const previous = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen })
  try {
    render(<ImageLightbox src="/example.png" onClose={vi.fn()} />)
    expect(fullscreen).toContainElement(screen.getByRole('dialog'))
    expect(fullscreen).toContainElement(screen.getByRole('button', { name: '关闭图片预览' }))
  } finally {
    cleanup()
    fullscreen.remove()
    if (previous) Object.defineProperty(document, 'fullscreenElement', previous)
    else Reflect.deleteProperty(document, 'fullscreenElement')
  }
})
