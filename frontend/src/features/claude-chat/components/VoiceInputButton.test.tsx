import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VoiceInputButton } from './VoiceInputButton'

const voice = vi.hoisted(() => ({ recording: false, start: vi.fn(), stop: vi.fn() }))
vi.mock('../hooks/useVoiceRecorder', () => ({ useVoiceRecorder: () => ({ ...voice, supported: true, seconds: 0 }) }))
vi.mock('../api', () => ({ sttAvailable: async () => true, transcribe: async () => '语音文字' }))
afterEach(() => { cleanup(); voice.recording = false; vi.clearAllMocks() })

it('moves only the idle entry into the menu and keeps recording controls after the menu closes', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const closeMenu = vi.fn(), onText = vi.fn()
  const view = render(<VoiceInputButton onText={onText} idleTarget={target} onIdleActivate={closeMenu} />)
  fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
  expect(voice.start).toHaveBeenCalledOnce()
  expect(closeMenu).toHaveBeenCalledOnce()
  voice.recording = true
  view.rerender(<VoiceInputButton onText={onText} idleTarget={null} />)
  target.remove()
  expect(screen.getByRole('button', { name: '取消录音' })).toBeVisible()
  voice.stop.mockResolvedValue(new Blob())
  fireEvent.click(screen.getByRole('button', { name: '停止并转写' }))
  await waitFor(() => expect(onText).toHaveBeenCalledWith('语音文字'))
})
