import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseClaudeChatSocket } from './useClaudeChatSocket'
import type { ChatItem } from '../types'
import { useVoiceRecorder } from './useVoiceRecorder'
import { useAudioAnalyser, type Bands } from './useAudioAnalyser'
import { transcribe } from '../api'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface VoiceModeMachine {
  state: VoiceState
  recording: boolean
  seconds: number
  /** 转写中 */
  busy: boolean
  error: string | null
  supported: boolean
  /** 最近一条用户转写（气泡用） */
  userText: string | null
  /** 最近一条 AI 回复文本（气泡用，随流式增长） */
  aiText: string | null
  startTalk: () => Promise<void>
  stopAndSend: () => Promise<void>
  cancelTalk: () => void
  /** 供 canvas 逐帧读取的驱动值（不触发 React 重渲染） */
  drive: () => { level: number; bands: Bands }
}

function lastAssistantText(items: ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind === 'assistant') return it.text
  }
  return null
}

/**
 * 电子鱼语音模式的纯前端状态机：idle / listening / thinking / speaking。
 *
 * - listening：麦克风真实振幅（AnalyserNode）驱动鱼形变；松手转写后 chat.send。
 * - thinking/speaking：无 TTS，按流式 assistantDelta 到达节奏推导「说话包络」（确定性）。
 * - 复用同一 chat/socket，不重连、不清空上下文。
 */
export function useVoiceModeMachine(chat: UseClaudeChatSocket | null): VoiceModeMachine {
  const rec = useVoiceRecorder()
  const analyser = useAudioAnalyser()
  const [state, setState] = useState<VoiceState>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userText, setUserText] = useState<string | null>(null)

  const running = chat?.running ?? false
  const aiText = chat ? lastAssistantText(chat.items) : null

  const envRef = useRef(0)
  const lastDeltaAtRef = useRef(0)
  const lastLenRef = useRef(0)

  // AI 文本增长 → 记录最近一次 delta 时间，作为合成包络的脉冲源
  useEffect(() => {
    const len = aiText?.length ?? 0
    if (len > lastLenRef.current) lastDeltaAtRef.current = performance.now()
    lastLenRef.current = len
  }, [aiText])

  // running / 文本 → 推导非录音态的状态（录音/转写期间不抢）
  useEffect(() => {
    if (state === 'listening' || busy) return
    if (running) setState(aiText ? 'speaking' : 'thinking')
    else setState('idle')
  }, [running, aiText, state, busy])

  const startTalk = useCallback(async () => {
    if (!chat) return
    setError(null)
    try {
      setState('listening')
      await rec.start(stream => analyser.attachStream(stream))
    } catch {
      setError('无法访问麦克风')
      setState('idle')
    }
  }, [chat, rec, analyser])

  const stopAndSend = useCallback(async () => {
    if (!chat) return
    setError(null)
    try {
      const blob = await rec.stop()
      analyser.detach()
      setBusy(true)
      const t = (await transcribe(blob))?.trim()
      if (t) {
        setUserText(t)
        chat.send(t)
        setState('thinking')
      } else {
        setState('idle')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '转写失败')
      setState('idle')
    } finally {
      setBusy(false)
    }
  }, [chat, rec, analyser])

  const cancelTalk = useCallback(() => {
    rec.cancel()
    analyser.detach()
    setState('idle')
  }, [rec, analyser])

  const drive = useCallback((): { level: number; bands: Bands } => {
    if (state === 'listening') return { level: analyser.level(), bands: analyser.bands() }
    if (state === 'speaking' || state === 'thinking') {
      const since = performance.now() - lastDeltaAtRef.current
      const target = state === 'speaking' ? Math.max(0.18, 1 - since / 350) : 0.22
      envRef.current += (target - envRef.current) * 0.25 // EMA 平滑
      const e = envRef.current
      return { level: e, bands: [e, e * 0.7, e * 0.45] }
    }
    envRef.current += (0 - envRef.current) * 0.1 // idle 回落
    return { level: envRef.current, bands: [0, 0, 0] }
  }, [state, analyser])

  return {
    state,
    recording: rec.recording,
    seconds: rec.seconds,
    busy,
    error,
    supported: rec.supported,
    userText,
    aiText,
    startTalk,
    stopAndSend,
    cancelTalk,
    drive,
  }
}
