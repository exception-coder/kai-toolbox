import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PreviewScreen } from './PreviewScreen'
import { previewFrame } from './api'

vi.mock('./api', () => ({ previewFrame: vi.fn(), previewInput: vi.fn() }))
const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (visibility) Object.defineProperty(document, 'visibilityState', visibility)
  else Reflect.deleteProperty(document, 'visibilityState')
})

it('keeps reading while visible, stops hidden heartbeats and resumes immediately on return', async () => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:preview'); static revokeObjectURL = revoke })
  vi.mocked(previewFrame).mockReset().mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  const view = render(<PreviewScreen id="same-preview" interactive={false} phone />)
  await act(async () => {})
  expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:preview')
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(previewFrame).toHaveBeenCalledTimes(2)
  const signal = vi.mocked(previewFrame).mock.calls[1][1]
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  fireEvent(document, new Event('visibilitychange'))
  expect(signal.aborted).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(20 * 60000) })
  expect(previewFrame).toHaveBeenCalledTimes(2)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  fireEvent(document, new Event('visibilitychange'))
  await act(async () => {})
  expect(previewFrame).toHaveBeenCalledTimes(3)
  expect(previewFrame).toHaveBeenLastCalledWith('same-preview', expect.any(AbortSignal))
  view.unmount()
  expect(revoke).toHaveBeenCalled()
})
