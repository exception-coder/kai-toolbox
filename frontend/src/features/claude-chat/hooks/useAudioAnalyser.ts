import { useCallback, useEffect, useRef } from 'react'
import { getSharedAudioContext } from '../sound'

/** 频段三元组：低 / 中 / 高，均归一化到 0~1。 */
export type Bands = [number, number, number]

export interface UseAudioAnalyser {
  /** 接入一路麦克风/音频流开始分析；重复接入会先断开旧的。 */
  attachStream: (stream: MediaStream) => void
  /** 断开分析并释放节点（不关闭共享 AudioContext，也不停 stream 的 track）。 */
  detach: () => void
  /** 当前归一化总振幅（RMS，0~1），未接流时返回 0。 */
  level: () => number
  /** 当前低/中/高频段能量（0~1）。 */
  bands: () => Bands
}

/**
 * Web Audio 频谱分析封装：把一路 MediaStream 接到共享 AudioContext 的 AnalyserNode，
 * 暴露随调随取的 level()/bands()（供 canvas 在 requestAnimationFrame 里逐帧读取，不触发 React 重渲染）。
 *
 * 复用 sound.ts 的单例 AudioContext，避免多开；只创建/销毁 source + analyser。
 */
export function useAudioAnalyser(): UseAudioAnalyser {
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  const detach = useCallback(() => {
    try { sourceRef.current?.disconnect() } catch { /* ignore */ }
    try { analyserRef.current?.disconnect() } catch { /* ignore */ }
    sourceRef.current = null
    analyserRef.current = null
    freqRef.current = null
  }, [])

  const attachStream = useCallback((stream: MediaStream) => {
    const ctx = getSharedAudioContext()
    if (!ctx) return
    detach()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.7
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    // 不接 destination：只分析，不外放（避免麦克风回授）
    analyserRef.current = analyser
    sourceRef.current = source
    freqRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
  }, [detach])

  const level = useCallback((): number => {
    const a = analyserRef.current
    const buf = freqRef.current
    if (!a || !buf) return 0
    a.getByteFrequencyData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length) / 255
    return Math.min(1, rms * 1.8) // 轻微提亮，让正常说话更明显
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

  // 卸载即断开
  useEffect(() => detach, [detach])

  return { attachStream, detach, level, bands }
}
