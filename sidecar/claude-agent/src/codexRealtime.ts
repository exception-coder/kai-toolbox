export interface CodexVoiceOffer {
  callId: string
  sdp: string
}

type Request = (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
type Emit = (event: Record<string, unknown>) => void
const VOICE_LEASE_MS = 45_000
const VOICE_CLOSE_TIMEOUT_MS = 5_000
const calls = new Map<string, CodexRealtimeCall>()

/** A single browser owns the audio lease; the native code task can outlive it. */
export class CodexRealtimeCall {
  private request?: Request
  private threadId?: string
  private timer?: NodeJS.Timeout
  private taken = false
  private ended = false
  private nativeTurnActive = false
  private disposed = false
  private reconnectOffer?: CodexVoiceOffer
  private reconnectOperation?: Promise<void>
  private reconnectCancelled = false
  private stopOperation?: Promise<void>
  private closedObserved = false
  private closedWaiter?: () => void
  private idleCloseNotified = false
  private onIdleClose?: () => void
  failure?: string

  constructor(readonly sessionId: string, private currentOffer: CodexVoiceOffer, private emit: Emit) {
    this.renew()
  }

  get listening(): boolean { return !this.ended }
  get offer(): CodexVoiceOffer { return this.currentOffer }

  cancelPendingReconnect(callId: string): boolean {
    if (this.reconnectOffer?.callId !== callId) return false
    this.reconnectCancelled = true
    return true
  }

  async reconnect(offer: CodexVoiceOffer, emit: Emit): Promise<void> {
    if (this.disposed || (!this.listening && !this.reconnectOffer && !this.nativeTurnActive)
      || !this.request || !this.threadId) throw new Error('当前没有可重连的语音线程，请在任务结束后重新开始语音')
    this.reconnectOffer = offer
    this.reconnectCancelled = false
    // Reserve the thread before stopping audio; serialize negotiations while allowing the latest click to supersede an older one.
    const operation = (this.reconnectOperation ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (this.reconnectOffer !== offer) throw new Error('语音已转移到另一设备')
      await this.stop('语音已转移到另一设备')
      await this.waitForClosed()
      if (this.reconnectOffer !== offer || this.reconnectCancelled || this.disposed) throw new Error('语音重连已取消或由另一设备接管')
      this.currentOffer = offer
      this.emit = emit
      this.ended = false
      this.closedObserved = false
      this.failure = undefined
      this.renew()
      await this.start(this.threadId!, this.request!, this.onIdleClose!)
      if (this.reconnectOffer !== offer || this.reconnectCancelled) {
        await this.stop('语音已转移到另一设备')
        throw new Error('语音重连已取消或由另一设备接管')
      }
    })
    this.reconnectOperation = operation
    try {
      await operation
    } catch (error) {
      if (this.currentOffer === offer && !this.ended) await this.stop()
      throw error
    } finally {
      if (this.reconnectOffer === offer) this.reconnectOffer = undefined
      if (this.reconnectOperation === operation) this.reconnectOperation = undefined
      this.notifyIdleClose()
    }
  }

  private waitForClosed(): Promise<void> {
    if (this.closedObserved) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.closedWaiter = undefined
        reject(new Error('旧音频连接关闭超时，请重试恢复语音'))
      }, VOICE_CLOSE_TIMEOUT_MS)
      this.closedWaiter = () => { clearTimeout(timeout); this.closedWaiter = undefined; resolve() }
    })
  }

  private notifyIdleClose(): void {
    if (!this.ended || this.nativeTurnActive || this.reconnectOffer || this.idleCloseNotified) return
    this.idleCloseNotified = true
    this.onIdleClose?.()
  }

  attachEmitter(emit: Emit): void { this.emit = emit }

  take(): boolean {
    if (this.taken) return false
    this.taken = true
    return true
  }

  renew(): void {
    if (this.ended) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.stop('语音连接已超时，请重新开始') }, VOICE_LEASE_MS)
    this.timer.unref()
  }

  async start(threadId: string, request: Request, onIdleClose: () => void): Promise<void> {
    if (this.ended) throw new Error('语音连接已取消，请重新开始')
    this.threadId = threadId
    this.request = request
    this.onIdleClose = onIdleClose
    this.event('connecting')
    await request('thread/realtime/start', {
      threadId, outputModality: 'audio', transport: { type: 'webrtc', sdp: this.offer.sdp },
      includeStartupContext: true, version: 'v3',
    })
    if (this.ended) await request('thread/realtime/stop', { threadId })
  }

  async appendText(input: Array<Record<string, unknown>>): Promise<void> {
    if (this.ended || !this.request || !this.threadId) throw new Error('语音对话已结束')
    const text = input.filter(item => item.type === 'text').map(item => item.text).join('\n')
    if (text) await this.request('thread/realtime/appendText', { threadId: this.threadId, text, role: 'user' })
  }

  observe(method: string, params: Record<string, unknown>): boolean {
    if (params.threadId !== this.threadId) return method.startsWith('thread/realtime/')
    if (method === 'turn/started') this.nativeTurnActive = true
    if (!method.startsWith('thread/realtime/')) return false
    if (method === 'thread/realtime/closed') {
      this.closedObserved = true
      this.closedWaiter?.()
    }
    if (this.ended) return true
    switch (method) {
      case 'thread/realtime/started': this.event('started'); break
      case 'thread/realtime/sdp': this.event('sdp', { sdp: params.sdp }); break
      case 'thread/realtime/transcript/delta':
        this.event('transcript', { role: params.role, text: params.delta, done: false }); break
      case 'thread/realtime/transcript/done':
        this.event('transcript', { role: params.role, text: params.text, done: true }); break
      case 'thread/realtime/error':
        this.reportFailure(String(params.message || '原生语音连接失败'))
        void this.stop(); break
      case 'thread/realtime/closed': this.close(String(params.reason || '语音对话已结束')); break
    }
    return true
  }

  /** Returns true when the transport must remain alive for another spoken turn. */
  completeNativeTurn(): boolean {
    this.nativeTurnActive = false
    return this.listening || Boolean(this.reconnectOffer)
  }

  reportFailure(message: string): void {
    this.failure = message
    this.event('error', { message })
  }

  stop(reason = '语音对话已结束'): Promise<void> {
    if (this.ended) return this.stopOperation ?? Promise.resolve()
    this.ended = true
    if (this.timer) clearTimeout(this.timer)
    this.stopOperation = this.stopAudio(reason)
    return this.stopOperation
  }

  private async stopAudio(reason: string): Promise<void> {
    try {
      if (this.request && this.threadId) await this.request('thread/realtime/stop', { threadId: this.threadId })
      this.event('closed', { message: reason })
    } catch (error) {
      this.reportFailure(`停止语音失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (!this.taken) this.dispose()
      this.notifyIdleClose()
    }
  }

  private close(reason: string): void {
    this.ended = true
    if (this.timer) clearTimeout(this.timer)
    this.event('closed', { message: reason })
    this.notifyIdleClose()
  }

  dispose(): void {
    this.disposed = true
    this.reconnectCancelled = true
    this.closedWaiter?.()
    if (this.timer) clearTimeout(this.timer)
    if (!this.ended) this.event('closed', { message: '语音连接已关闭' })
    this.ended = true
    if (calls.get(this.sessionId) === this) calls.delete(this.sessionId)
  }

  private event(event: string, data: Record<string, unknown> = {}): void {
    this.emit({ type: 'voiceEvent', seq: 0, callId: this.offer.callId, event, ...data })
  }
}

export function prepareCodexVoice(sessionId: string, offer: CodexVoiceOffer, emit: Emit): void {
  validateVoiceOffer(offer)
  if (calls.has(sessionId)) throw new Error('当前会话已有语音连接')
  calls.set(sessionId, new CodexRealtimeCall(sessionId, offer, emit))
}

function validateVoiceOffer(offer: CodexVoiceOffer): void {
  if (!offer || !/^[\w-]{1,100}$/.test(offer.callId) || typeof offer.sdp !== 'string'
    || offer.sdp.length > 64_000 || !offer.sdp.startsWith('v=0')) throw new Error('无效的语音连接参数')
}

export async function reconnectCodexVoice(sessionId: string, offer: CodexVoiceOffer, emit: Emit): Promise<void> {
  try {
    validateVoiceOffer(offer)
    const call = calls.get(sessionId)
    if (!call) throw new Error('原语音线程已结束，请重新点击语音对话')
    await call.reconnect(offer, emit)
  } catch (error) {
    emit({ type: 'voiceEvent', seq: 0, callId: offer?.callId, event: 'error',
      message: error instanceof Error ? error.message : '语音重连失败' })
  }
}

export function takeCodexVoice(sessionId?: string, callId?: string): CodexRealtimeCall | undefined {
  if (!callId) return undefined
  const call = sessionId ? calls.get(sessionId) : undefined
  if (!call || call.offer.callId !== callId || !call.take()) throw new Error('语音连接已取消或过期，请重新开始')
  return call
}

export async function controlCodexVoice(sessionId: string, callId: string, action: string): Promise<void> {
  const call = calls.get(sessionId)
  if (action === 'stop' && call?.cancelPendingReconnect(callId)) {
    if (call.offer.callId === callId) await call.stop()
    return
  }
  if (!call || call.offer.callId !== callId) return
  if (action === 'heartbeat') call.renew()
  if (action === 'stop') await call.stop()
}
