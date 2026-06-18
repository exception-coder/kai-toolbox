import { useCallback, useEffect, useRef } from 'react'
import { getSharedAudioContext } from '../sound'

/** 频段三元组：低 / 中 / 高，均归一化到 0~1。 */
export type Bands = [number, number, number]

export interface UseAudioAnalyser {
  /** 接入一路麦克风/音频流开始分析（只分析、不外放，避免回授）；重复接入会先断开旧的。 */
  attachStream: (stream: MediaStream) => void
  /** 断开麦克风分析并释放节点（不关闭共享 AudioContext，也不停 stream 的 track）。 */
  detach: () => void
  /** 播放一段 TTS 音频（wav/ArrayBuffer）：外放 + 同时经 analyser 测振幅；resolve 于播放结束。 */
  playBuffer: (data: ArrayBuffer) => Promise<void>
  /** 停止正在播放的 TTS。 */
  stopPlayback: () => void
  /** 当前归一化总振幅（RMS，0~1），无信号时返回 0。 */
  level: () => number
  /** 当前低/中/高频段能量（0~1）。 */
  bands: () => Bands
}

/**
 * Web Audio 频谱分析封装：把麦克风流或 TTS 音频接到共享 AudioContext 的单个 AnalyserNode，
 * 暴露随调随取的 level()/bands()（供 canvas 在 requestAnimationFrame 里逐帧读取，不触发 React 重渲染）。
 *
 * 复用 sound.ts 的单例 AudioContext。麦克风源不接 destination（不外放、防回授）；
 * TTS 源同时接 analyser + destination（既出声又被测振幅）。
 */
export function useAudioAnalyser(): UseAudioAnalyser {
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  const ensureAnalyser = useCallback((): AnalyserNode | null => {
    const ctx = getSharedAudioContext()
    if (!ctx) return null
    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      analyserRef.current = analyser
      freqRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    }
    return analyserRef.current
  }, [])

  const detach = useCallback(() => {
    try { micSourceRef.current?.disconnect() } catch { /* ignore */ }
    micSourceRef.current = null
  }, [])

  const attachStream = useCallback((stream: MediaStream) => {
    const ctx = getSharedAudioContext()
    const analyser = ensureAnalyser()
    if (!ctx || !analyser) return
    detach()
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser) // 不接 destination：只分析，不外放
    micSourceRef.current = source
  }, [detach, ensureAnalyser])

  const stopPlayback = useCallback(() => {
    const s = ttsSourceRef.current
    ttsSourceRef.current = null
    if (s) {
      try { s.onended = null; s.stop() } catch { /* already stopped */ }
      try { s.disconnect() } catch { /* ignore */ }
    }
  }, [])

  const playBuffer = useCallback((data: ArrayBuffer): Promise<void> => {
    return new Promise<void>((resolve) => {
      const ctx = getSharedAudioContext()
      const analyser = ensureAnalyser()
      if (!ctx || !analyser) { resolve(); return }
      stopPlayback()
      // decodeAudioData 会“吞掉”传入的 ArrayBuffer，复制一份避免影响调用方
      ctx.decodeAudioData(data.slice(0)).then(buffer => {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(analyser)       // 测振幅
        source.connect(ctx.destination) // 外放出声
        source.onended = () => {
          if (ttsSourceRef.current === source) ttsSourceRef.current = null
          try { source.disconnect() } catch { /* ignore */ }
          resolve()
        }
        ttsSourceRef.current = source
        source.start()
      }).catch(() => resolve()) // 解码失败：当作没声音，回落由调用方处理
    })
  }, [ensureAnalyser, stopPlayback])

  const level = useCallback((): number => {
    const a = analyserRef.current
    const buf = freqRef.current
    if (!a || !buf) return 0
    a.getByteFrequencyData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length) / 255
    return Math.min(1, rms * 1.8)
  }, [])

  const bands = useCallback((): Bands => {
    const a = analyserRef.current
    const buf = freqRef.current
    if (!a || !buf) return [0, 0, 0]
    a.getByteFrequencyData(buf)
    const n = buf.length
    const avg = (from: number, to: number) => {
      let s = 0
      for (let i = from; i < to; i++) s += buf[i]
      return (s / Math.max(1, to - from)) / 255
    }
    return [avg(0, n / 3), avg(n / 3, (2 * n) / 3), avg((2 * n) / 3, n)]
  }, [])

  // 卸载即断开麦克风 + 停播放
  useEffect(() => () => { detach(); stopPlayback() }, [detach, stopPlayback])

  return { attachStream, detach, playBuffer, stopPlayback, level, bands }
}
