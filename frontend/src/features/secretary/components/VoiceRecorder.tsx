import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Mic, RefreshCw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDurationShort, pickVoiceMime } from '../lib/format'

interface Props {
  disabled?: boolean
  onSubmit: (blob: Blob, durationMs: number, mimeType: string) => Promise<void> | void
}

type Status =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'submitting'

// 不可恢复或需要用户操作的环境/权限错误
interface FailInfo {
  code:
    | 'no-mediadevices'    // navigator.mediaDevices 不存在（多见于 HTTP 站点、老 webview）
    | 'no-recorder'        // MediaRecorder 类型不存在
    | 'insecure-context'   // 非 HTTPS / 非 localhost
    | 'denied'             // 用户 / 系统拒绝
    | 'no-device'          // 没找到可用麦克风
    | 'device-busy'        // 设备被占用
    | 'unsupported-mime'   // 没有可用 mime
    | 'unknown'
  detail?: string
}

interface EnvCheck {
  ok: boolean
  fail?: FailInfo
}

function checkEnv(): EnvCheck {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { ok: false, fail: { code: 'unknown', detail: '运行环境异常' } }
  }
  // HTTPS / localhost 之外，绝大多数浏览器会把 mediaDevices 设为 undefined
  if (window.isSecureContext === false) {
    return {
      ok: false,
      fail: {
        code: 'insecure-context',
        detail: '页面当前不在安全上下文中，浏览器不允许调用麦克风',
      },
    }
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return {
      ok: false,
      fail: {
        code: 'no-mediadevices',
        detail: '当前浏览器或 WebView 未暴露 mediaDevices 接口',
      },
    }
  }
  if (typeof window.MediaRecorder === 'undefined') {
    return {
      ok: false,
      fail: {
        code: 'no-recorder',
        detail: 'MediaRecorder API 不可用',
      },
    }
  }
  return { ok: true }
}

function explainError(err: unknown): FailInfo {
  const e = err as { name?: string; message?: string } | null
  const name = e?.name ?? ''
  const message = e?.message ?? String(err ?? '')
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return { code: 'denied', detail: '麦克风权限被拒绝' }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { code: 'no-device', detail: '没有找到可用的麦克风设备' }
    case 'NotReadableError':
    case 'TrackStartError':
      return { code: 'device-busy', detail: '麦克风被其它应用占用，无法读取' }
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return { code: 'unsupported-mime', detail: '当前设备不支持所需的录音参数' }
    case 'AbortError':
      return { code: 'unknown', detail: '获取麦克风被中断，请重试' }
    case 'TypeError':
      // getUserMedia 在 HTTP 等不安全上下文下会抛 TypeError
      return {
        code: 'no-mediadevices',
        detail: '浏览器拒绝调用麦克风（多见于 HTTP 页面 / 隐私模式）',
      }
    default:
      return { code: 'unknown', detail: message || '未知错误' }
  }
}

function tipsOf(code: FailInfo['code']): string[] {
  switch (code) {
    case 'no-mediadevices':
      return [
        '请使用 HTTPS 或 localhost 打开本站点',
        '系统浏览器版本过低时换 Chrome / Safari / Edge 最新版重试',
        'WebView / App 内嵌时联系应用方放开麦克风权限',
      ]
    case 'insecure-context':
      return [
        '在地址栏把 http:// 改成 https://',
        '或在桌面端用 localhost / 127.0.0.1 访问',
      ]
    case 'no-recorder':
      return ['当前浏览器不支持 MediaRecorder，请升级到最新版 Chrome / Edge / Safari']
    case 'denied':
      return [
        '点击地址栏左侧的小锁，把「麦克风」改为允许',
        'iOS：设置 → Safari → 麦克风 → 允许；安卓：系统设置 → 应用 → 浏览器 → 权限',
        '修改后回到本页面刷新即可重试',
      ]
    case 'no-device':
      return [
        '检查电脑 / 手机是否插入或连接了麦克风',
        '系统设置中确认默认输入设备可用',
      ]
    case 'device-busy':
      return [
        '关闭正在使用麦克风的其它应用（如腾讯会议、Zoom、语音助手）',
        '然后回到本页面重试',
      ]
    case 'unsupported-mime':
      return ['当前设备的麦克风不支持默认参数，可换一个浏览器再试']
    case 'unknown':
    default:
      return ['请刷新页面重试；若仍无效请换一个浏览器或设备']
  }
}

function titleOf(code: FailInfo['code']): string {
  switch (code) {
    case 'no-mediadevices':
      return '无法访问麦克风接口'
    case 'insecure-context':
      return '当前非安全上下文'
    case 'no-recorder':
      return '浏览器不支持录音'
    case 'denied':
      return '麦克风权限被拒绝'
    case 'no-device':
      return '没有可用的麦克风'
    case 'device-busy':
      return '麦克风被其它应用占用'
    case 'unsupported-mime':
      return '录音参数不被支持'
    case 'unknown':
    default:
      return '录音启动失败'
  }
}

export function VoiceRecorder({ disabled, onSubmit }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [fail, setFail] = useState<FailInfo | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const tickRef = useRef<number | null>(null)

  // 首屏环境预检：把致命缺失（mediaDevices 不存在 / 非 HTTPS / 无 MediaRecorder）
  // 提前显示出来，避免用户点了「开始录音」却什么都没发生
  useEffect(() => {
    const env = checkEnv()
    if (!env.ok && env.fail) setFail(env.fail)
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cleanup() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    try {
      recorderRef.current?.stream.getTracks().forEach(t => t.stop())
    } catch {
      /* noop */
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    recorderRef.current = null
    streamRef.current = null
    chunksRef.current = []
  }

  async function handleStart() {
    if (disabled) return
    // 每次点击都重做一次预检，避免页面长时间停留后环境已变化
    const env = checkEnv()
    if (!env.ok && env.fail) {
      setFail(env.fail)
      return
    }
    setFail(null)
    setStatus('requesting')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setStatus('idle')
      setFail(explainError(err))
      return
    }
    streamRef.current = stream
    const mime = pickVoiceMime()
    let recorder: MediaRecorder
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
    } catch (err) {
      // 个别 Android WebView 给出的 stream 与 MediaRecorder 不兼容
      stream.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setStatus('idle')
      setFail(explainError(err))
      return
    }
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onerror = e => {
      const errEvent = e as Event & { error?: unknown }
      setFail(explainError(errEvent.error ?? new Error('MediaRecorder error')))
      try {
        recorder.stop()
      } catch {
        /* noop */
      }
    }
    recorder.onstop = async () => {
      const finalMime = recorder.mimeType || mime || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: finalMime })
      const duration = Date.now() - startedAtRef.current
      chunksRef.current = []
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      recorderRef.current = null
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current)
        tickRef.current = null
      }
      if (blob.size === 0) {
        setStatus('idle')
        setElapsedMs(0)
        return
      }
      setStatus('submitting')
      try {
        await onSubmit(blob, duration, finalMime)
      } finally {
        setStatus('idle')
        setElapsedMs(0)
      }
    }
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    try {
      recorder.start(250)
    } catch (err) {
      cleanup()
      setStatus('idle')
      setFail(explainError(err))
      return
    }
    setStatus('recording')
    tickRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 250)
  }

  function handleStop() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch (err) {
        setFail(explainError(err))
        cleanup()
        setStatus('idle')
      }
    } else {
      setStatus('idle')
    }
  }

  const recording = status === 'recording'
  // 仅当致命环境错误时禁用按钮；权限/设备类错误允许点击重试
  const fatal =
    fail?.code === 'no-mediadevices' ||
    fail?.code === 'insecure-context' ||
    fail?.code === 'no-recorder'

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-[var(--color-muted)]/30 p-4">
      <div className="flex items-center justify-center gap-3">
        {!recording ? (
          <Button
            size="lg"
            onClick={handleStart}
            disabled={
              disabled || fatal || status === 'requesting' || status === 'submitting'
            }
          >
            <Mic className="size-4" />
            {status === 'requesting'
              ? '请求麦克风…'
              : status === 'submitting'
                ? '保存中…'
                : '开始录音'}
          </Button>
        ) : (
          <Button size="lg" variant="destructive" onClick={handleStop}>
            <Square className="size-4" />
            停止
          </Button>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 text-sm">
        <span
          className={
            recording
              ? 'inline-block size-2 animate-pulse rounded-full bg-[var(--color-destructive)]'
              : 'inline-block size-2 rounded-full bg-[var(--color-muted-foreground)]/40'
          }
        />
        <span className="font-mono tabular-nums text-[var(--color-muted-foreground)]">
          {formatDurationShort(elapsedMs)}
        </span>
      </div>

      {fail && (
        <div className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-3 text-xs text-[var(--color-foreground)]">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--color-destructive)]">
            <AlertTriangle className="size-3.5" />
            {titleOf(fail.code)}
          </div>
          {fail.detail && (
            <p className="mb-2 text-[var(--color-muted-foreground)]">{fail.detail}</p>
          )}
          <ul className="ml-4 list-disc space-y-0.5 text-[var(--color-muted-foreground)]">
            {tipsOf(fail.code).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {!fatal && (
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFail(null)
                  void handleStart()
                }}
                disabled={status === 'requesting' || status === 'submitting'}
              >
                <RefreshCw className="size-3.5" />
                重试
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
