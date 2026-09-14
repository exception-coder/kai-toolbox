import { afterEach, describe, expect, it, vi } from 'vitest'
const media = vi.hoisted(() => ({ offer: vi.fn(), answer: vi.fn(), close: vi.fn(), mute: vi.fn() }))
vi.mock('../features/claude-chat/public-api/voice', () => ({
  NativeVoiceConnection: class { offer = media.offer; answer = media.answer; close = media.close; mute = media.mute },
  voiceErrorMessage: (error: Error) => error.message,
}))
import { AssistantVoiceSession } from './AssistantVoiceSession'

function fixture() {
  media.offer.mockResolvedValue('v=0')
  media.answer.mockResolvedValue(undefined)
  const port = { start: vi.fn().mockResolvedValue(undefined), control: vi.fn(), state: vi.fn(), transcript: vi.fn() }
  return { port, session: new AssistantVoiceSession(port) }
}
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })
describe('capsule voice lease', () => {
  it('cancels permission pending work without sending an offer', async () => {
    const { port, session } = fixture()
    let resolve!: (sdp: string) => void
    media.offer.mockReturnValue(new Promise<string>(done => { resolve = done }))
    const pending = session.start()
    session.stop()
    resolve('v=0')
    await pending
    expect(port.start).not.toHaveBeenCalled()
    expect(media.close).toHaveBeenCalledOnce()
  })
  it('handles answer and transcript only for the current call and stops without interrupt', async () => {
    const { port, session } = fixture()
    await session.start()
    const callId = port.start.mock.calls[0][0].callId
    session.accept({ type: 'voiceEvent', seq: 0, callId: 'old', event: 'sdp', sdp: 'wrong' })
    expect(media.answer).not.toHaveBeenCalled()
    session.accept({ type: 'voiceEvent', seq: 0, callId, event: 'sdp', sdp: 'answer' })
    expect(media.answer).toHaveBeenCalledWith('answer')
    session.mute()
    expect(media.mute).toHaveBeenCalledWith(true)
    session.stop()
    expect(port.control).toHaveBeenCalledWith(callId, 'stop')
    expect(session.active).toBe(false)
  })
  it('releases taken-over audio without sending an old stop or auto reconnecting', async () => {
    const { port, session } = fixture()
    await session.start()
    const callId = port.start.mock.calls[0][0].callId
    session.accept({ type: 'voiceEvent', seq: 0, callId, event: 'closed', message: '语音已转移到另一设备' })
    expect(media.close).toHaveBeenCalledOnce()
    expect(port.control).not.toHaveBeenCalled()
    expect(port.start).toHaveBeenCalledOnce()
    expect(port.state).toHaveBeenLastCalledWith({ status: 'closed', muted: false, message: '语音已转移到另一设备' })
  })
  it('bounds negotiation and stops heartbeats on failure', async () => {
    vi.useFakeTimers()
    const { port, session } = fixture()
    await session.start()
    vi.advanceTimersByTime(30_000)
    expect(session.active).toBe(false)
    expect(port.state.mock.lastCall?.[0].status).toBe('error')
    const count = port.control.mock.calls.length
    vi.advanceTimersByTime(60_000)
    expect(port.control).toHaveBeenCalledTimes(count)
  })
  it('shows denied permission and allows retry', async () => {
    const { port, session } = fixture()
    media.offer.mockRejectedValueOnce(new Error('麦克风权限被拒绝'))
    await session.start()
    expect(port.state.mock.lastCall?.[0].message).toContain('权限')
    await session.start()
    expect(port.start).toHaveBeenCalledOnce()
    session.stop()
  })
})
