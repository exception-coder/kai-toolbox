import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VoiceInputButton } from './VoiceInputButton'
import { transcribe } from '../api'

const voice = vi.hoisted(() => ({ recording: false, start: vi.fn(), stop: vi.fn() }))
vi.mock('../hooks/useVoiceRecorder', () => ({ useVoiceRecorder: () => ({ ...voice, supported: true, seconds: 0 }) }))
vi.mock('../api', () => ({ sttAvailable: async () => true, transcribe: vi.fn().mockResolvedValue('语音文字') }))
afterEach(() => { cleanup(); voice.recording = false; vi.clearAllMocks() })

it('moves only the idle entry into the menu and keeps recording controls after the menu closes', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const closeMenu = vi.fn(), onText = vi.fn()
  const view = render(<VoiceInputButton onText={onText} idleTarget={target} onIdleActivate={closeMenu} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '语音输入' })).toBeEnabled())
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

it('uses the consultation endpoint and discards a late transcript after changing context', async () => {
  let complete!: (text: string) => void
  vi.mocked(transcribe).mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  voice.recording = true
  voice.stop.mockResolvedValue(new Blob())
  const onText = vi.fn()
  const page = render(<VoiceInputButton scope="consultation" onText={onText} />)
  fireEvent.click(screen.getByRole('button', { name: '停止并转写' }))
  await waitFor(() => expect(transcribe).toHaveBeenCalledWith(expect.any(Blob), 'auto', 'consultation'))
  page.unmount()
  complete('不应进入新会话')
  await Promise.resolve()
  expect(onText).not.toHaveBeenCalled()
})
