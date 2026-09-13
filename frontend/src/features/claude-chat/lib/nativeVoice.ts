export interface VoiceOffer { callId: string; sdp: string }
export interface VoiceEvent {
  seq: number
  type: 'voiceEvent'
  callId: string
  event: 'connecting' | 'started' | 'sdp' | 'transcript' | 'closed' | 'error'
  sdp?: string
  role?: string
  text?: string
  done?: boolean
  message?: string
}

export interface VoiceTransport {
  start: (offer: VoiceOffer) => boolean
  control: (sessionId: string, callId: string, action: 'heartbeat' | 'stop') => void
  subscribe: (listener: (event: VoiceEvent) => void) => () => void
}

export function voiceAvailability(): string | null {
  if (!window.isSecureContext) return '请使用 HTTPS 或 localhost 打开会话后使用语音'
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
    return '当前浏览器不支持实时语音，请使用新版 Chrome、Edge 或 Safari'
  }
  return null
}

export function voiceErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '麦克风权限被拒绝，请在浏览器网站设置中允许后重试'
    if (error.name === 'NotFoundError') return '未找到麦克风，请连接设备后重试'
    if (error.name === 'NotReadableError') return '麦克风正被占用或不可用，请检查设备后重试'
  }
  return error instanceof Error ? error.message : '语音连接失败，请重试或继续文字会话'
}

/** Owns media resources even when permission resolves after the view has gone away. */
export class NativeVoiceConnection {
  private peer?: RTCPeerConnection
  private stream?: MediaStream
  private audio?: HTMLAudioElement
  private closed = false

  constructor(private readonly onConnected: () => void, private readonly onError: (error: unknown) => void) {}

  async offer(): Promise<string | null> {
    const unavailable = voiceAvailability()
    if (unavailable) throw new Error(unavailable)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
    })
    if (this.closed) { stream.getTracks().forEach(track => track.stop()); return null }
    this.stream = stream
    const peer = new RTCPeerConnection()
    this.peer = peer
    const audio = new Audio()
    audio.autoplay = true
    this.audio = audio
    stream.getAudioTracks().forEach(track => {
      track.onended = () => { if (!this.closed) this.onError(new Error('麦克风已断开，请检查设备后重试')) }
      peer.addTrack(track, stream)
    })
    peer.createDataChannel('oai-events')
    peer.ontrack = event => {
      if (this.closed) return
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
      void audio.play().catch(error => { if (!this.closed) this.onError(error) })
    }
    peer.onconnectionstatechange = () => {
      if (this.closed) return
      if (peer.connectionState === 'connected') this.onConnected()
      if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
        this.onError(new Error('语音网络连接已断开，请重新开始'))
      }
    }
    await peer.setLocalDescription(await peer.createOffer())
    return this.closed ? null : peer.localDescription?.sdp ?? null
  }

  async answer(sdp: string): Promise<void> {
    if (this.closed || !this.peer) return
    await this.peer.setRemoteDescription({ type: 'answer', sdp })
  }

  mute(muted: boolean): void {
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    if (this.peer) {
      this.peer.ontrack = null
      this.peer.onconnectionstatechange = null
      this.peer.close()
    }
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null }
  }
}
