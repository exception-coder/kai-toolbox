import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseClaudeChatSocket } from './useClaudeChatSocket'
import type { ChatItem } from '../types'
import { useVoiceRecorder } from './useVoiceRecorder'
import { useAudioAnalyser, type Bands } from './useAudioAnalyser'
import { transcribe, synthesize, ttsAvailable as fetchTtsAvailable } from '../api'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface VoiceModeMachine {
  state: VoiceState
  recording: boolean
  seconds: number
  /** 转写中 */
  busy: boolean
  error: string | null
  supported: boolean
  /** TTS 是否就绪：true=AI 用真实语音回复；false=只有合成动画（不出声） */
  ttsReady: boolean
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
 * 云团语音模式的纯前端状态机：idle / listening / thinking / speaking。
 *
 * - listening：麦克风真实振幅（AnalyserNode）驱动云团；松手转写后 chat.send。
 * - thinking：等待/流式期间，按 delta 到达节奏推合成包络（确定性）。
 * - speaking：回合结束后，若本地 TTS 就绪则合成 AI 回复并播放，用真实音频振幅驱动云团；
 *   TTS 不可用则保持合成包络动画（不出声）。
 * - 复用同一 chat/socket，不重连、不清空上下文。
 */
export function useVoiceModeMachine(chat: UseClaudeChatSocket | null): VoiceModeMachine {
  const rec = useVoiceRecorder()
  const analyser = useAudioAnalyser()
  const [state, setState] = useState<VoiceState>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userText, setUserText] = useState<string | null>(null)
  const [ttsReady, setTtsReady] = useState(false)

  const running = chat?.running ?? false
  const aiText = chat ? lastAssistantText(chat.items) : null

  const envRef = useRef(0)
  const lastDeltaAtRef = useRef(0)
  const lastLenRef = useRef(0)
  // TTS 播放编排
  const aiTextRef = useRef<string | null>(null)
  aiTextRef.current = aiText
  const prevRunningRef = useRef(running)
  const ttsReadyRef = useRef(false)
  const ttsActiveRef = useRef(false)   // 正在「合成+播放」AI 回复（拦截 running 派生态）
  const ttsPlayingRef = useRef(false)  // 真实音频正在出声（drive 改读 analyser）
  const lastSpokenRef = useRef<string | null>(null)

  // 进入即探测本地 TTS 是否就绪
  useEffect(() => {
    let alive = true
    fetchTtsAvailable().then(v => { if (alive) { setTtsReady(v); ttsReadyRef.current = v } })
    return () => { alive = false }
  }, [])

  // AI 文本增长 → 记录最近一次 delta 时间，作为合成包络的脉冲源
  useEffect(() => {
    const len = aiText?.length ?? 0
    if (len > lastLenRef.current) lastDeltaAtRef.current = performance.now()
    lastLenRef.current = len
  }, [aiText])

  // 回合边界：true→false 结束则朗读回复；false→true 开始则允许下条回复再次朗读。
  // 本 effect 先于下方「running 派生态」声明，确保 ttsActiveRef 先被置上。
  useEffect(() => {
    const prev = prevRunningRef.current
    prevRunningRef.current = running
    if (!prev && running) {
      lastSpokenRef.current = null // 新回合：允许朗读
      return
    }
    if (prev && !running) {
      const reply = (aiTextRef.current ?? '').trim()
      if (!ttsReadyRef.current || !reply || reply === lastSpokenRef.current) return
      lastSpokenRef.current = reply
      ttsActiveRef.current = true
      setState('speaking')
      void (async () => {
        try {
          const audio = await synthesize(reply)
          if (!ttsActiveRef.current) return // 期间被打断（用户说话）
          ttsPlayingRef.current = true
          await analyser.playBuffer(audio)
        } catch {
          /* 合成/播放失败：静默回落到合成动画 */
        } finally {
          ttsPlayingRef.current = false
          ttsActiveRef.current = false
          setState(s => (s === 'listening' ? s : 'idle'))
        }
      })()
    }
  }, [running, analyser])

  // running / 文本 → 推导非录音态的状态（录音/转写/朗读期间不抢）
  useEffect(() => {
    if (state === 'listening' || busy || ttsActiveRef.current) return
    if (running) setState(aiText ? 'speaking' : 'thinking')
    else setState('idle')
  }, [running, aiText, state, busy])

  const startTalk = useCallback(async () => {
    if (!chat) return
    setError(null)
    // 打断正在播放的 AI 语音
    ttsActiveRef.current = false
    ttsPlayingRef.current = false
    analyser.stopPlayback()
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
    // 录音中 或 TTS 真实出声中 → 读真实音频振幅
    if (state === 'listening' || ttsPlayingRef.current) {
      return { level: analyser.level(), bands: analyser.bands() }
    }
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
    ttsReady,
    userText,
    aiText,
    startTalk,
    stopAndSend,
    cancelTalk,
    drive,
  }
}
