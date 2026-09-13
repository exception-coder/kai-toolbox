import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeVoiceConnection, voiceAvailability, voiceErrorMessage } from './nativeVoice'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('native voice media lifecycle', () => {
  it('explains insecure origins and microphone permission denial', () => {
    vi.stubGlobal('isSecureContext', false)
    expect(voiceAvailability()).toContain('HTTPS')
    expect(voiceErrorMessage(new DOMException('denied', 'NotAllowedError'))).toContain('麦克风权限')
  })

  it('stops tracks acquired after cancellation without creating a peer', async () => {
    vi.stubGlobal('isSecureContext', true)
    const peer = vi.fn()
    vi.stubGlobal('RTCPeerConnection', peer)
    const stop = vi.fn()
    let grant!: (stream: MediaStream) => void
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(resolve => { grant = resolve }) } })
    const connection = new NativeVoiceConnection(vi.fn(), vi.fn())
    const pending = connection.offer()
    connection.close()
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    expect(await pending).toBeNull()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(peer).not.toHaveBeenCalled()
  })

  it('negotiates, mutes and releases local tracks, peer and playback exactly once', async () => {
    vi.stubGlobal('isSecureContext', true)
    const track = { enabled: true, stop: vi.fn() }
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
    const peer = { addTrack: vi.fn(), createDataChannel: vi.fn(), close: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer' }),
      setLocalDescription: vi.fn(), localDescription: { sdp: 'offer' }, setRemoteDescription: vi.fn(),
      connectionState: 'new', onconnectionstatechange: null as (() => void) | null, ontrack: null }
    vi.stubGlobal('RTCPeerConnection', vi.fn(function () { return peer }))
    const audio = { autoplay: false, pause: vi.fn(), srcObject: stream }
    vi.stubGlobal('Audio', vi.fn(function () { return audio }))
    const connected = vi.fn()
    const connection = new NativeVoiceConnection(connected, vi.fn())
    expect(await connection.offer()).toBe('offer')
    await connection.answer('answer')
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer' })
    peer.connectionState = 'connected'
    peer.onconnectionstatechange?.()
    expect(connected).toHaveBeenCalledOnce()
    connection.mute(true)
    expect(track.enabled).toBe(false)
    connection.close(); connection.close()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(peer.close).toHaveBeenCalledOnce()
    expect(audio.srcObject).toBeNull()
  })
})
