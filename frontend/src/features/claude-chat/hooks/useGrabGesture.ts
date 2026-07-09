import { useEffect, useRef } from 'react'
import type { GestureRecognizer } from '@mediapipe/tasks-vision'

export type GestureStatus = 'idle' | 'loading' | 'running' | 'error'

/**
 * 「抓握」手势 → 触发回调（本模块用于弹出悬浮窗）。
 *
 * <p>基于 MediaPipe GestureRecognizer（浏览器内 WASM 推理，隐私不出本机）。识别到手从「非握拳」
 * 变为「Closed_Fist（握拳/抓）」的瞬间即触发一次（带冷却防连发）。仅在 enabled 时开摄像头，
 * 组件卸载 / enabled 关闭即释放摄像头与推理器——因本 hook 只挂在 Vibe Coding 会话页，故监控天然
 * 只在该模块内生效。
 *
 * 模型/WASM 默认走 CDN；境内不通时可把文件放本机并改下面两个常量（jsdelivr 一般可达，
 * google storage 若被墙需自备 gesture_recognizer.task）。加载/摄像头失败一律软降级（onStatus='error'），
 * 不抛错、不影响会话。
 */
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

interface Options {
  enabled: boolean
  onGrab: () => void
  onStatus?: (s: GestureStatus) => void
  onError?: (msg: string) => void
  /** 触发后的冷却毫秒，防一次抓握连发。默认 2500。 */
  cooldownMs?: number
}

export function useGrabGesture({ enabled, onGrab, onStatus, onError, cooldownMs = 2500 }: Options): void {
  const onGrabRef = useRef(onGrab)
  const onStatusRef = useRef(onStatus)
  const onErrorRef = useRef(onError)
  onGrabRef.current = onGrab
  onStatusRef.current = onStatus
  onErrorRef.current = onError

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onStatusRef.current?.('error')
      onErrorRef.current?.('当前环境不支持摄像头（需 HTTPS / localhost）')
      return
    }

    let cancelled = false
    let recognizer: GestureRecognizer | null = null
    let stream: MediaStream | null = null
    let raf = 0
    let video: HTMLVideoElement | null = null

    const cleanup = () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
      if (video) { video.srcObject = null }
      try { recognizer?.close() } catch { /* ignore */ }
      recognizer = null
    }

    ;(async () => {
      onStatusRef.current?.('loading')
      try {
        // 动态加载 MediaPipe：只有真正开启手势才拉这坨(~1MB+)，不拖累会话页首屏 chunk
        const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        // 先试 GPU，失败回退 CPU（部分机器/浏览器无 WebGPU/WebGL）
        const make = (delegate: 'GPU' | 'CPU') => GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 1,
        })
        try { recognizer = await make('GPU') } catch { recognizer = await make('CPU') }
        if (cancelled) { cleanup(); return }

        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
        if (cancelled) { cleanup(); return }
        video = document.createElement('video')
        video.playsInline = true
        video.muted = true
        video.srcObject = stream
        await video.play()
        onStatusRef.current?.('running')

        let lastGesture = ''
        let lastFireAt = 0
        const loop = () => {
          if (cancelled || !recognizer || !video) return
          const now = performance.now()
          try {
            const res = recognizer.recognizeForVideo(video, now)
            const g = res.gestures?.[0]?.[0]?.categoryName ?? ''
            // 抓握 = 从非握拳变成握拳的那一刻；冷却内不重复触发
            if (g === 'Closed_Fist' && lastGesture !== 'Closed_Fist' && now - lastFireAt > cooldownMs) {
              lastFireAt = now
              onGrabRef.current()
            }
            lastGesture = g
          } catch { /* 单帧识别异常忽略，继续下一帧 */ }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      } catch (e) {
        if (cancelled) return
        cleanup()
        onStatusRef.current?.('error')
        const msg = e instanceof Error ? e.message : String(e)
        onErrorRef.current?.(/Permission|NotAllowed/i.test(msg) ? '摄像头权限被拒绝' : `手势模型加载失败：${msg}`)
      }
    })()

    return cleanup
  }, [enabled, cooldownMs])
}
