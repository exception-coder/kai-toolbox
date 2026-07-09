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
// WASM：jsdelivr 境内一般可达；可用 localStorage 'kai-toolbox:gesture-wasm-url' 覆盖。
const WASM_URL = localStorage.getItem('kai-toolbox:gesture-wasm-url')
  || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

// 模型候选（按序尝试，第一个加载成功即用）：
//   1) localStorage 'kai-toolbox:gesture-model-url' 覆盖（自定义/代理地址）
//   2) 本机 public 下自备：把 gesture_recognizer.task 放到 frontend/public/mediapipe/ 即走它（境内首选，离线可用）
//   3) google storage 官方（境内常被墙——这也是「开了却没动静」的常见原因）
const MODEL_URLS: string[] = [
  localStorage.getItem('kai-toolbox:gesture-model-url') || '',
  `${import.meta.env.BASE_URL}mediapipe/gesture_recognizer.task`,
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
].filter(Boolean)

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
      // 先开摄像头：让权限弹窗与摄像头指示灯立刻出现（即便模型稍后加载失败，用户也能看到「确实在启动识别」）
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      } catch (e) {
        if (cancelled) return
        onStatusRef.current?.('error')
        const msg = e instanceof Error ? e.message : String(e)
        onErrorRef.current?.(/Permission|NotAllowed|denied/i.test(msg) ? '摄像头权限被拒绝（浏览器地址栏允许摄像头后重开）' : `摄像头打开失败：${msg}`)
        return
      }
      if (cancelled) { cleanup(); return }
      try {
        video = document.createElement('video')
        video.playsInline = true
        video.muted = true
        video.srcObject = stream
        await video.play()

        // 动态加载 MediaPipe（只有开启才拉，不拖累首屏）+ 逐个候选模型地址尝试，直到某个能加载
        const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        const make = (path: string, delegate: 'GPU' | 'CPU') => GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: path, delegate },
          runningMode: 'VIDEO',
          numHands: 1,
        })
        let lastErr: unknown = null
        for (const url of MODEL_URLS) {
          try { recognizer = await make(url, 'GPU') } catch { try { recognizer = await make(url, 'CPU') } catch (e) { lastErr = e; recognizer = null } }
          if (recognizer) break
        }
        if (!recognizer) throw (lastErr ?? new Error('所有候选模型地址均加载失败'))
        if (cancelled) { cleanup(); return }
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
