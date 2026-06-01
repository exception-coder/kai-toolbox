import { useCallback, useEffect, useRef, useState } from 'react'

/** 浏览器是否支持录音（getUserMedia + MediaRecorder）。 */
export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
}

export interface UseVoiceRecorder {
  recording: boolean
  seconds: number
  supported: boolean
  /** 开始录音；失败（无权限等）抛错 */
  start: () => Promise<void>
  /** 停止并返回录音 blob */
  stop: () => Promise<Blob>
  /** 取消录音，丢弃数据 */
  cancel: () => void
}

/**
 * 封装麦克风录音。stop() resolve 出整段音频 blob，交给后端 ffmpeg 统一转码，
 * 因此不强求特定 mimeType——各端（iOS Safari mp4/aac、Android webm/opus）原样上传即可。
 */
export function useVoiceRecorder(): UseVoiceRecorder {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recRef.current = null
    chunksRef.current = []
    setRecording(false)
    setSeconds(0)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    if (recRef.current) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    const rec = new MediaRecorder(stream)
    chunksRef.current = []
    rec.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.start()
    recRef.current = rec
    setRecording(true)
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }, [])

  const stop = useCallback(() => {
    return new Promise<Blob>((resolve, reject) => {
      const rec = recRef.current
      if (!rec) {
        reject(new Error('未在录音'))
        return
      }
      rec.onstop = () => {
        const type = rec.mimeType || chunksRef.current[0]?.type || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        cleanup()
        resolve(blob)
      }
      rec.stop()
    })
  }, [cleanup])

  const cancel = useCallback(() => {
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null
      try { rec.stop() } catch { /* ignore */ }
    }
    cleanup()
  }, [cleanup])

  return { recording, seconds, supported: isRecordingSupported(), start, stop, cancel }
}
