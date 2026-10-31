import { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useChatFocusMode } from './useChatFocusMode'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function Fixture({ restore, capture }: { restore: () => void; capture?: () => () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const focus = useChatFocusMode(root, restore, capture)
  return <><button>背景导航</button><div ref={root} data-testid="root" data-focused={focus.focused}>
    <button onClick={focus.enter}>专注</button><button onClick={focus.exit}>退出</button>
    <textarea aria-label="草稿" defaultValue="保留输入" />
  </div></>
}
it('preserves draft and restores background interaction when exiting with Escape', () => {
  const restore = vi.fn()
  render(<Fixture restore={restore} />)
  const draft = screen.getByLabelText('草稿')
  fireEvent.click(screen.getByText('专注'))
  expect(screen.getByTestId('root')).toHaveAttribute('data-focused', 'true')
  expect(screen.getByText('背景导航').inert).toBe(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(restore).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('草稿')).toBe(draft)
  expect(draft).toHaveValue('保留输入')
  expect(screen.getByText('背景导航').inert).not.toBe(true)
})
it('keeps window focus mode usable if native fullscreen is rejected', async () => {
  const request = vi.fn().mockRejectedValue(new Error('unsupported'))
  render(<Fixture restore={vi.fn()} />)
  Object.defineProperty(screen.getByTestId('root'), 'requestFullscreen', { value: request })
  fireEvent.click(screen.getByText('专注'))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(screen.getByTestId('root')).toHaveAttribute('data-focused', 'true')
  fireEvent.click(screen.getByText('退出'))
  expect(screen.getByTestId('root')).toHaveAttribute('data-focused', 'false')
})

it('restores the reading anchor after each layout transition without replacing the draft', async () => {
  const reposition = vi.fn(), capture = vi.fn(() => reposition)
  render(<Fixture restore={vi.fn()} capture={capture} />)
  const draft = screen.getByLabelText('草稿')
  fireEvent.click(screen.getByText('专注'))
  await waitFor(() => expect(reposition).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('退出'))
  await waitFor(() => expect(reposition).toHaveBeenCalledTimes(2))
  expect(capture).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('草稿')).toBe(draft)
})

it('keeps mobile input above the keyboard and cleans viewport listeners on exit', () => {
  const viewport = Object.assign(new EventTarget(), { height: 720, offsetTop: 0, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const request = vi.fn()
  render(<Fixture restore={vi.fn()} />)
  const root = screen.getByTestId('root')
  Object.defineProperty(root, 'requestFullscreen', { value: request })
  fireEvent.click(screen.getByText('专注'))
  expect(request).not.toHaveBeenCalled()
  expect(root.style.getPropertyValue('--cc-focus-height')).toBe('720px')
  act(() => { viewport.height = 360; viewport.offsetTop = 24; viewport.dispatchEvent(new Event('resize')) })
  expect(root.style.getPropertyValue('--cc-focus-height')).toBe('360px')
  expect(root.style.getPropertyValue('--cc-focus-top')).toBe('24px')
  act(() => { viewport.scale = 2; viewport.height = 180; viewport.dispatchEvent(new Event('scroll')) })
  expect(root.style.getPropertyValue('--cc-focus-height')).toBe('360px')
  fireEvent.click(screen.getByText('退出'))
  expect(root.style.getPropertyValue('--cc-focus-height')).toBe('')
  act(() => { viewport.scale = 1; viewport.dispatchEvent(new Event('resize')) })
  expect(root.style.getPropertyValue('--cc-focus-height')).toBe('')
})
