import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VoiceInputButton } from './VoiceInputButton'
import { transcribe, transcribeCodexDictation, codexDictationAvailable } from '../api'

const voice = vi.hoisted(() => ({ recording: false, start: vi.fn(), stop: vi.fn() }))
vi.mock('../hooks/useVoiceRecorder', () => ({ useVoiceRecorder: () => ({ ...voice, supported: true, seconds: 0 }) }))
vi.mock('../api', () => ({ sttAvailable: async () => true, transcribe: vi.fn().mockResolvedValue('语音文字'),
  codexDictationAvailable: vi.fn().mockResolvedValue({ available: true }),
  transcribeCodexDictation: vi.fn().mockResolvedValue('Codex 听写文字') }))
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

it('uses native Codex dictation and only returns draft text once after duplicate stop clicks', async () => {
  const onText = vi.fn()
  const page = render(<VoiceInputButton codexSessionId="original-session" onText={onText} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Codex 听写' })).toBeEnabled())
  expect(codexDictationAvailable).toHaveBeenCalledWith('original-session', expect.any(AbortSignal))
  voice.recording = true
  voice.stop.mockResolvedValue(new Blob())
  page.rerender(<VoiceInputButton codexSessionId="original-session" onText={onText} />)
  const stop = screen.getByRole('button', { name: '停止并转写' })
  fireEvent.click(stop)
  fireEvent.click(stop)
  await waitFor(() => expect(onText).toHaveBeenCalledWith('Codex 听写文字'))
  expect(transcribeCodexDictation).toHaveBeenCalledTimes(1)
  expect(transcribe).not.toHaveBeenCalled()
})

it('never falls back to Whisper before the Codex session has connected', async () => {
  render(<VoiceInputButton codexSessionId="" onText={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '请先连接 Codex 会话后使用听写' })).toBeDisabled())
  expect(transcribe).not.toHaveBeenCalled()
  expect(codexDictationAvailable).not.toHaveBeenCalled()
})

it('keeps native failures visible without falling back and aborts late native results on leaving', async () => {
  voice.recording = true
  voice.stop.mockResolvedValue(new Blob())
  vi.mocked(transcribeCodexDictation).mockRejectedValueOnce(new Error('当前 Codex 账号无法访问听写服务'))
  const onText = vi.fn()
  const page = render(<VoiceInputButton codexSessionId="original" onText={onText} />)
  fireEvent.click(screen.getByRole('button', { name: '停止并转写' }))
  voice.recording = false
  page.rerender(<VoiceInputButton codexSessionId="original" onText={onText} />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('账号无法访问'))
  expect(transcribe).not.toHaveBeenCalled()
  let complete!: (text: string) => void
  vi.mocked(transcribeCodexDictation).mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  voice.recording = true
  page.rerender(<VoiceInputButton codexSessionId="original" onText={onText} />)
  fireEvent.click(screen.getByRole('button', { name: '停止并转写' }))
  await waitFor(() => expect(transcribeCodexDictation).toHaveBeenCalledTimes(2))
  const signal = vi.mocked(transcribeCodexDictation).mock.calls[1][2]
  page.unmount()
  expect(signal.aborted).toBe(true)
  complete('旧会话内容')
  await Promise.resolve()
  expect(onText).not.toHaveBeenCalled()
})
