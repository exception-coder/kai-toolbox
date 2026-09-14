import { NativeVoiceConnection, voiceErrorMessage, type VoiceEvent, type VoiceOffer } from '../features/claude-chat/public-api/voice'

export interface AssistantVoiceState {
  status: 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
  muted: boolean
  message?: string
}

export interface AssistantVoicePort {
  start: (offer: VoiceOffer) => Promise<void>
  control: (callId: string, action: 'stop' | 'heartbeat') => void
  state: (state: AssistantVoiceState) => void
  transcript: (event: VoiceEvent) => void
}

/** Owns one explicit microphone lease; cancelled asynchronous work cannot revive it. */
export class AssistantVoiceSession {
  private call?: { id: string; media: NativeVoiceConnection; timer?: number; timeout?: number }
  private state: AssistantVoiceState = { status: 'idle', muted: false }

  constructor(private readonly port: AssistantVoicePort) {}

  get active(): boolean { return Boolean(this.call) }

  async start(): Promise<void> {
    if (this.call) return
    const id = crypto.randomUUID()
    const media = new NativeVoiceConnection(() => {
      if (this.call?.id !== id) return
      window.clearTimeout(this.call.timeout)
      this.publish({ status: 'connected', muted: this.state.muted })
    }, error => this.fail(id, error))
    const call = { id, media, timer: undefined as number | undefined, timeout: undefined as number | undefined }
    this.call = call
    this.publish({ status: 'connecting', muted: false })
    call.timeout = window.setTimeout(() => this.fail(id, new Error('语音连接超时，请重新连接')), 30_000)
    try {
      const sdp = await media.offer()
      if (!sdp || this.call !== call) return
      await this.port.start({ callId: id, sdp })
      if (this.call !== call) { this.port.control(id, 'stop'); return }
      call.timer = window.setInterval(() => this.port.control(id, 'heartbeat'), 10_000)
    } catch (error) { this.fail(id, error) }
  }

  accept(event: VoiceEvent): void {
    const call = this.call
    if (!call || event.callId !== call.id) return
    if (event.event === 'sdp' && event.sdp) {
      void call.media.answer(event.sdp).catch(error => this.fail(call.id, error))
    } else if (event.event === 'transcript') this.port.transcript(event)
    else if (event.event === 'closed' || event.event === 'error') {
      this.release(false)
      this.publish({ status: event.event === 'error' ? 'error' : 'closed', muted: false, message: event.message })
    }
  }

  mute(): void {
    if (!this.call) return
    const muted = !this.state.muted
    this.call.media.mute(muted)
    this.publish({ ...this.state, muted })
  }

  stop(message?: string): void {
    if (!this.call) return
    this.release(true)
    this.publish({ status: 'closed', muted: false, message })
  }

  private fail(id: string, error: unknown): void {
    if (this.call?.id !== id) return
    this.release(true)
    this.publish({ status: 'error', muted: false, message: voiceErrorMessage(error) })
  }

  private release(notify: boolean): void {
    const call = this.call
    if (!call) return
    this.call = undefined
    window.clearTimeout(call.timeout)
    window.clearInterval(call.timer)
    call.media.close()
    if (notify) this.port.control(call.id, 'stop')
  }

  private publish(state: AssistantVoiceState): void { this.state = state; this.port.state(state) }
}
