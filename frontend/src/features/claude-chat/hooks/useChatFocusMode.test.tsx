import { useRef } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useChatFocusMode } from './useChatFocusMode'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
function Fixture({ restore }: { restore: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const focus = useChatFocusMode(root, restore)
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
