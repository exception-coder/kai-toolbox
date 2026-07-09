import { useEffect, useRef } from 'react'
import type { GestureRecognizer } from '@mediapipe/tasks-vision'
import { gestureModelUrls, gestureWasmUrl } from './gestureSources'
import { acquireCamera, heartbeatCamera, onCameraReleased, releaseCamera } from './cameraLock'

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
/** 关注的手势类别（MediaPipe categoryName）。 */
export type HandGesture = 'Closed_Fist' | 'Open_Palm'

interface Options {
  enabled: boolean
  /** 识别到「进入」某手势的瞬间触发（带每手势冷却）。 */
  onGesture: (g: HandGesture) => void
  onStatus?: (s: GestureStatus) => void
  onError?: (msg: string | null) => void
  /** 同一手势触发后的冷却毫秒，防连发。默认 2500。 */
  cooldownMs?: number
}

const WATCHED: HandGesture[] = ['Closed_Fist', 'Open_Palm']

export function useGrabGesture({ enabled, onGesture, onStatus, onError, cooldownMs = 2500 }: Options): void {
  const onGrabRef = useRef(onGesture)
  const onStatusRef = useRef(onStatus)
  const onErrorRef = useRef(onError)
  onGrabRef.current = onGesture
  onStatusRef.current = onStatus
  onErrorRef.current = onError

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onStatusRef.current?.('error')
      onErrorRef.current?.('当前环境不支持摄像头（需 HTTPS / localhost）')
      return
    }

    let disposed = false
    let running = false
    let recognizer: GestureRecognizer | null = null
    let stream: MediaStream | null = null
    let raf = 0
    let hb: ReturnType<typeof setInterval> | undefined
    let video: HTMLVideoElement | null = null

    const stopCam = (nextStatus?: GestureStatus, errMsg?: string | null) => {
      running = false
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      if (hb) { clearInterval(hb); hb = undefined }
      stream?.getTracks().forEach(t => t.stop()); stream = null
      if (video) { video.srcObject = null; video = null }
      try { recognizer?.close() } catch { /* ignore */ }
      recognizer = null
      releaseCamera() // 让出锁，等待中的其它标签会自动重试
      if (nextStatus) onStatusRef.current?.(nextStatus)
      if (errMsg !== undefined) onErrorRef.current?.(errMsg)
    }

    // 只在标签可见时开摄像头：切走 / 后台即释放，天然避免多标签同时抢占
    const wantRun = () => !disposed && document.visibilityState === 'visible'

    const start = async () => {
      if (disposed || running || !wantRun()) return
      // 跨标签单占用：别的标签正在用就不抢，报明确原因，等其释放自动重试
      if (!acquireCamera()) {
        onStatusRef.current?.('error')
        onErrorRef.current?.('摄像头被其它标签页/程序占用——到占用处关掉后，这里会自动重试')
        return
      }
      running = true
      onStatusRef.current?.('loading')
      onErrorRef.current?.(null)
      hb = setInterval(() => { if (!heartbeatCamera()) stopCam('idle') }, 1000) // 被别的标签抢走则退让
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
        if (disposed || !running) { stopCam(); return }
        video = document.createElement('video')
        video.playsInline = true
        video.muted = true
        video.srcObject = stream
        await video.play()

        // 动态加载 MediaPipe（只有开启才拉，不拖累首屏）+ 逐个候选模型地址尝试
        const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(gestureWasmUrl())
        const make = (path: string, delegate: 'GPU' | 'CPU') => GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: path, delegate },
          runningMode: 'VIDEO',
          numHands: 1,
        })
        let lastErr: unknown = null
        for (const url of gestureModelUrls()) {
          try { recognizer = await make(url, 'GPU') } catch { try { recognizer = await make(url, 'CPU') } catch (e) { lastErr = e; recognizer = null } }
          if (recognizer) break
        }
        if (!recognizer) throw (lastErr ?? new Error('所有候选模型地址均加载失败'))
        if (disposed || !running) { stopCam(); return }
        onStatusRef.current?.('running')

        let lastGesture = ''
        const lastFireAt: Record<string, number> = {}
        const loop = () => {
          if (!running || disposed || !recognizer || !video) return
          const now = performance.now()
          try {
            const res = recognizer.recognizeForVideo(video, now)
            const g = res.gestures?.[0]?.[0]?.categoryName ?? ''
            // 「进入」某个关注手势的瞬间触发（从别的状态切进来）；每手势各自冷却
            if (g !== lastGesture && (WATCHED as string[]).includes(g) && now - (lastFireAt[g] ?? 0) > cooldownMs) {
              lastFireAt[g] = now
              onGrabRef.current(g as HandGesture)
            }
            lastGesture = g
          } catch { /* 单帧识别异常忽略，继续下一帧 */ }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const friendly = /Permission|NotAllowed|denied/i.test(msg) ? '摄像头权限被拒绝（地址栏允许摄像头后重开）'
          : /NotReadable|in use/i.test(msg) ? '摄像头被其它程序/标签占用（关掉后重试）'
          : `启动失败：${msg}`
        stopCam('error', friendly)
      }
    }

    const onVis = () => { if (document.visibilityState === 'visible') void start(); else stopCam('idle') }
    document.addEventListener('visibilitychange', onVis)
    const offReleased = onCameraReleased(() => { if (!running && wantRun()) void start() })
    void start()

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVis)
      offReleased()
      stopCam()
    }
  }, [enabled, cooldownMs])
}
