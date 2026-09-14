import { expect, it, vi } from 'vitest'
import { mountAssistantWidget } from './widget'
it('keeps voice in the composer and renders mute, hangup and recoverable states', () => {
  const root = document.createElement('div')
  document.body.append(root)
  const voice = { start: vi.fn(), mute: vi.fn(), stop: vi.fn() }
  const unmount = mountAssistantWidget(root, { voice })
  const shadow = root.firstElementChild!.shadowRoot!
  const start = shadow.querySelector<HTMLButtonElement>('[data-voice-start]')!
  start.click()
  expect(voice.start).toHaveBeenCalledOnce()
  root.dispatchEvent(new CustomEvent('kai-assistant-state', { detail: { voice: { status: 'connected', muted: true } } }))
  expect(start.hidden).toBe(true)
  expect(shadow.querySelector('[data-voice-mute]')!.textContent).toBe('取消静音')
  shadow.querySelector<HTMLButtonElement>('[data-voice-stop]')!.click()
  expect(voice.stop).toHaveBeenCalledOnce()
  root.dispatchEvent(new CustomEvent('kai-assistant-state', { detail: { voice: { status: 'error', muted: false, message: '请重试' } } }))
  expect(start.hidden).toBe(false)
  expect(shadow.querySelector('.voice-controls')!.textContent).toContain('请重试')
  unmount()
  root.remove()
})
