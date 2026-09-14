import { useCallback, useEffect, useRef, useState } from 'react'
import { NativeVoiceConnection, voiceErrorMessage, type VoiceEvent, type VoiceTransport } from '../lib/nativeVoice'

interface Call {
  id: string
  sessionId: string
  connection: NativeVoiceConnection
  unsubscribe: () => void
  heartbeat: ReturnType<typeof setInterval>
  timeout: ReturnType<typeof setTimeout>
}
const CONNECTION_TIMEOUT_MS = 90_000
const HEARTBEAT_MS = 10_000

export function useNativeVoice(sessionId: string | null, transport: VoiceTransport, connected: boolean) {
  const [state, setState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const callRef = useRef<Call | null>(null)
  const transportRef = useRef(transport)
  transportRef.current = transport

  const release = useCallback(() => {
    const call = callRef.current
    if (!call) return
    callRef.current = null
    call.connection.close()
    call.unsubscribe()
    clearInterval(call.heartbeat)
    clearTimeout(call.timeout)
    transportRef.current.control(call.sessionId, call.id, 'stop')
  }, [])

  const stop = useCallback(() => { release(); setState('idle'); setMuted(false) }, [release])
  const fail = useCallback((failure: unknown) => {
    release()
    setError(voiceErrorMessage(failure))
    setState('error')
    setMuted(false)
  }, [release])

  const start = useCallback(async () => {
    if (!sessionId || !connected || callRef.current) return
    const id = crypto.randomUUID()
    setError(null)
    setNotice(null)
    setMuted(false)
    setState('connecting')
    const current = () => callRef.current?.id === id
    const connection = new NativeVoiceConnection(() => {
      if (!current()) return
      clearTimeout(callRef.current!.timeout)
      setState('connected')
    }, failure => { if (current()) fail(failure) })
    const onEvent = (event: VoiceEvent) => {
      if (!current() || event.callId !== id) return
      if (event.event === 'sdp' && event.sdp) {
        void connection.answer(event.sdp).catch(failure => { if (current()) fail(failure) })
      }
      if (event.event === 'error') fail(new Error(event.message || '原生语音连接失败'))
      if (event.event === 'closed') { setNotice(event.message || null); stop() }
    }
    callRef.current = {
      id, sessionId, connection, unsubscribe: transportRef.current.subscribe(onEvent),
      heartbeat: setInterval(() => transportRef.current.control(sessionId, id, 'heartbeat'), HEARTBEAT_MS),
      timeout: setTimeout(() => { if (current()) fail(new Error('语音连接超时，请重试或继续文字会话')) }, CONNECTION_TIMEOUT_MS),
    }
    try {
      const sdp = await connection.offer()
      if (!current()) return
      if (!sdp || !transportRef.current.start({ callId: id, sdp })) {
        fail(new Error('会话连接不可用，请恢复连接后重试'))
      }
    } catch (failure) { if (current()) fail(failure) }
  }, [sessionId, connected, fail, stop])

  useEffect(() => { stop(); setNotice(null); return release }, [sessionId, stop, release])
  useEffect(() => { if (!connected && callRef.current) fail(new Error('会话连接已断开，请重连后重新开始语音')) }, [connected, fail])
  useEffect(() => {
    const hidden = () => { if (document.hidden && callRef.current) stop() }
    window.addEventListener('pagehide', stop)
    document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', hidden) }
  }, [stop])

  const toggleMute = () => {
    callRef.current?.connection.mute(!muted)
    setMuted(!muted)
  }
  return { state, error, notice, muted, start, stop, toggleMute }
}
