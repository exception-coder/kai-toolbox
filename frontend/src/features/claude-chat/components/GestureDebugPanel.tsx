import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { gestureModelUrls, gestureWasmUrl } from '../hooks/gestureSources'
import { acquireCamera, heartbeatCamera, releaseCamera } from '../hooks/cameraLock'
import { useChatRuntime } from '../runtime/ChatRuntimeContext'

type StepState = 'pending' | 'running' | 'ok' | 'fail'
interface Step { key: string; label: string; state: StepState; detail?: string }

const STEPS: { key: string; label: string }[] = [
  { key: 'secure', label: '安全环境（HTTPS / localhost）' },
  { key: 'camera', label: '摄像头授权与画面' },
  { key: 'wasm', label: '加载 MediaPipe 运行时（WASM）' },
  { key: 'model', label: '加载手势模型（逐个候选地址）' },
  { key: 'recognizer', label: '初始化识别器' },
  { key: 'live', label: '实时识别（对着摄像头比手势）' },
]

/**
 * 手势自检面板：逐步测试「安全环境→摄像头→WASM→模型→识别器→实时识别」，每步给结果，
 * 并显示实时画面 + 当前识别到的手势，帮助区分「功能 bug」还是「模型/网络/权限」问题。
 * 复用与 useGrabGesture 相同的来源解析（gestureSources），测的就是实际会用的地址。
 */
export function GestureDebugPanel({ onClose }: { onClose: () => void }) {
  const [steps, setSteps] = useState<Step[]>(STEPS.map(s => ({ ...s, state: 'pending' })))
  const [running, setRunning] = useState(false)
  const [gesture, setGesture] = useState<string>('—')
  const [grabbed, setGrabbed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  // 清理句柄
  const cleanupRef = useRef<() => void>(() => {})
  // 自检期间暂停常驻手势监控（同标签内避免抢摄像头），关闭面板恢复
  const { setGesturePaused } = useChatRuntime()
  useEffect(() => {
    setGesturePaused(true)
    return () => { setGesturePaused(false); cleanupRef.current() }
  }, [setGesturePaused])

  const set = (key: string, state: StepState, detail?: string) =>
    setSteps(prev => prev.map(s => (s.key === key ? { ...s, state, detail } : s)))

  const run = async () => {
    cleanupRef.current()
    setSteps(STEPS.map(s => ({ ...s, state: 'pending' })))
    setGesture('—'); setGrabbed(false); setRunning(true)

    let stream: MediaStream | null = null
    let recognizer: { recognizeForVideo: (v: HTMLVideoElement, t: number) => { gestures?: { categoryName: string; score: number }[][] }; close: () => void } | null = null
    let raf = 0
    let hb: ReturnType<typeof setInterval> | undefined
    let stopped = false
    const cleanup = () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      if (hb) clearInterval(hb)
      stream?.getTracks().forEach(t => t.stop())
      try { recognizer?.close() } catch { /* ignore */ }
      releaseCamera()
    }
    cleanupRef.current = cleanup

    try {
      // 1) 安全环境
      set('secure', 'running')
      const secure = typeof window !== 'undefined' && (window.isSecureContext || location.hostname === 'localhost')
      if (!secure || !navigator.mediaDevices?.getUserMedia) {
        set('secure', 'fail', '需 HTTPS 或 localhost，且浏览器支持摄像头')
        setRunning(false); return
      }
      set('secure', 'ok', location.origin)

      // 2) 摄像头（先抢跨标签锁，避免与其它标签/常驻监控争用）
      set('camera', 'running')
      if (!acquireCamera()) {
        set('camera', 'fail', '摄像头被其它标签页/程序占用——到占用处关掉后重试')
        setRunning(false); return
      }
      hb = setInterval(() => heartbeatCamera(), 1000)
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        set('camera', 'fail', /Permission|NotAllowed|denied/i.test(msg) ? '权限被拒绝——地址栏允许摄像头后重试'
          : /NotReadable|in use/i.test(msg) ? '摄像头被其它程序/标签占用（关掉后重试）' : msg)
        cleanup(); setRunning(false); return
      }
      if (stopped) { cleanup(); return }
      const video = videoRef.current!
      video.srcObject = stream
      video.muted = true; video.playsInline = true
      await video.play()
      set('camera', 'ok', '画面已就绪')

      // 3) WASM
      set('wasm', 'running', gestureWasmUrl())
      const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
      let vision
      try {
        vision = await FilesetResolver.forVisionTasks(gestureWasmUrl())
        set('wasm', 'ok', gestureWasmUrl())
      } catch (e) {
        set('wasm', 'fail', `${gestureWasmUrl()} — ${e instanceof Error ? e.message : String(e)}`)
        setRunning(false); return
      }

      // 4) 模型（逐个候选）
      set('model', 'running')
      const urls = gestureModelUrls()
      const tried: string[] = []
      let usedUrl = ''
      for (const url of urls) {
        try {
          const make = (delegate: 'GPU' | 'CPU') => GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: url, delegate },
            runningMode: 'VIDEO', numHands: 1,
          })
          try { recognizer = await make('GPU') as unknown as typeof recognizer } catch { recognizer = await make('CPU') as unknown as typeof recognizer }
          usedUrl = url
          break
        } catch (e) {
          tried.push(`✗ ${url}（${e instanceof Error ? e.message : String(e)}）`)
        }
      }
      if (!recognizer) {
        set('model', 'fail', tried.join('  |  ') || '无候选地址')
        set('recognizer', 'fail', '模型未加载')
        setRunning(false); return
      }
      set('model', 'ok', `已用 ${usedUrl}`)
      set('recognizer', 'ok', '就绪')

      // 6) 实时识别
      set('live', 'running', '对着摄像头张开手掌 → 握拳试试')
      let last = ''
      const loop = () => {
        if (stopped || !recognizer) return
        const now = performance.now()
        try {
          const res = recognizer.recognizeForVideo(video, now)
          const top = res.gestures?.[0]?.[0]
          const name = top?.categoryName ?? 'None'
          setGesture(top ? `${name} (${(top.score * 100).toFixed(0)}%)` : '未检测到手')
          if (name === 'Closed_Fist' && last !== 'Closed_Fist') {
            setGrabbed(true)
            set('live', 'ok', '已识别到「握拳/抓」——正式功能此时会弹出悬浮窗')
          }
          last = name
        } catch { /* ignore frame */ }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    } catch (e) {
      set('live', 'fail', e instanceof Error ? e.message : String(e))
      setRunning(false)
    }
  }

  const stop = () => { cleanupRef.current(); setRunning(false); setGesture('—') }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="font-medium">手势自检</span>
          <span className="text-xs text-[var(--color-muted-foreground)]">测试「抓握弹窗」能不能用</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 hover:bg-[var(--color-accent)]"><X className="size-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={run} disabled={running}>{running ? '测试中…' : '开始测试'}</Button>
            {running && <Button size="sm" variant="outline" onClick={stop}>停止</Button>}
            <span className={`text-sm ${grabbed ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-muted-foreground)]'}`}>
              当前手势：{gesture}{grabbed ? ' ✓ 抓握已识别' : ''}
            </span>
          </div>

          {/* 实时画面（镜像，便于比划） */}
          <video ref={videoRef} className="aspect-video w-full -scale-x-100 rounded-lg border bg-black/80" />

          <ul className="space-y-1.5">
            {steps.map(s => (
              <li key={s.key} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {s.state === 'ok' ? <CheckCircle2 className="size-4 text-emerald-500" />
                    : s.state === 'fail' ? <XCircle className="size-4 text-[var(--color-destructive)]" />
                    : s.state === 'running' ? <Loader2 className="size-4 animate-spin text-[var(--color-primary)]" />
                    : <span className="block size-4 rounded-full border" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={s.state === 'fail' ? 'text-[var(--color-destructive)]' : ''}>{s.label}</span>
                  {s.detail && <span className="block break-all text-xs text-[var(--color-muted-foreground)]">{s.detail}</span>}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
            模型卡在「加载手势模型」失败：多为 google storage 被墙。可把 gesture_recognizer.task 放到
            <code className="mx-1 rounded bg-[var(--color-muted)] px-1">frontend/public/mediapipe/</code>
            （境内首选），或在控制台设
            <code className="mx-1 rounded bg-[var(--color-muted)] px-1">localStorage['kai-toolbox:gesture-model-url']</code>
            指到可达地址后重测。
          </p>
        </div>
      </div>
    </div>
  )
}
