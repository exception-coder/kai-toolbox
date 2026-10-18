import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Mic, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { sttAvailable, transcribe } from '../api'

/**
 * 麦克风输入：点一下开始录音，再点停止并转写，转写文本经 onText 回填输入框。
 *
 * 录音/识别中的显示与悬浮窗迷你态的 {@link MiniVoiceBar} 保持一致：录音时展开成
 * 「✕ 取消 · 跳动绿点 + 秒数 · ■ 停止并转写」的胶囊条；识别中显示「识别中…」胶囊；
 * 空闲态才是麦克风图标按钮。浏览器不支持或 faster-whisper 未就绪时禁用并提示。
 */
export function VoiceInputButton({ onText, disabled, className, idleTarget, onIdleActivate, onActiveChange, scope = 'coding' }: {
  onText: (t: string) => void; disabled?: boolean; className?: string
  idleTarget?: HTMLElement | null; onIdleActivate?: () => void
  onActiveChange?: (active: boolean) => void
  scope?: 'coding' | 'consultation' | 'work-assistants'
}) {
  const rec = useVoiceRecorder()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    onActiveChange?.(starting || rec.recording || busy)
    return () => onActiveChange?.(false)
  }, [starting, rec.recording, busy, onActiveChange])

  useEffect(() => {
    sttAvailable(scope).then(value => { if (mounted.current) setAvailable(value) })
      .catch(() => { if (mounted.current) setAvailable(false) })
  }, [scope])

  const start = async () => {
    if (starting || disabled) return
    setStarting(true)
    setErr(null)
    onIdleActivate?.()
    try {
      await rec.start()
    } catch {
      if (mounted.current) setErr('无法访问麦克风，请在网站设置中允许后重试')
    } finally {
      if (mounted.current) setStarting(false)
    }
  }

  const stopAndTranscribe = async () => {
    setErr(null)
    try {
      const blob = await rec.stop()
      if (!mounted.current) return
      setBusy(true)
      const text = await transcribe(blob, 'auto', scope)
      if (text && mounted.current) onText(text)
    } catch (e) {
      if (mounted.current) setErr(e instanceof Error ? e.message : '转写失败')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const cancel = async () => {
    setErr(null)
    try { await rec.stop() } catch { /* 丢弃录音 */ }
  }

  // 识别中：与迷你态一致的「识别中…」胶囊
  if (busy) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-background)] px-3 text-xs text-[var(--color-muted-foreground)]">
        <Loader2 className="size-4 animate-spin" /> 识别中…
      </div>
    )
  }

  // 录音中：与迷你态一致的胶囊条（取消 · 跳动点 + 秒数 · 停止并转写）
  if (rec.recording) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-primary)] bg-[var(--color-background)] px-1.5">
        <button
          type="button"
          onClick={cancel}
          aria-label="取消录音"
          title="取消录音"
          className="flex size-6 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <X className="size-3.5" />
        </button>
        <span className="flex items-center gap-1 px-0.5">
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className="size-1 rounded-full bg-[var(--color-primary)] animate-pulse" style={{ animationDelay: `${i * 110}ms` }} />
          ))}
        </span>
        <span className="min-w-[2.2ch] text-xs tabular-nums text-[var(--color-muted-foreground)]">{rec.seconds}s</span>
        <button
          type="button"
          onClick={stopAndTranscribe}
          aria-label="停止并转写"
          title="停止并转写到输入框"
          className="flex size-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          <Square className="size-3" />
        </button>
      </div>
    )
  }

  const off = !rec.supported || available === false
  const title = !rec.supported ? (window.isSecureContext ? '当前浏览器不支持录音' : '请使用 HTTPS 或 localhost 后使用语音输入')
    : available === false ? 'faster-whisper 服务未启动，语音输入不可用'
    : err ? err
    : '语音输入'

  const button = (
    <Button
      type="button"
      variant="ghost"
      size={idleTarget ? 'sm' : 'icon'}
      className={idleTarget ? 'min-h-11 w-full gap-2 text-xs' : className}
      onClick={start}
      disabled={disabled || off || starting || available === null}
      title={title}
      aria-label={title}
    >
      {starting ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
      {idleTarget && <span>语音输入</span>}
    </Button>
  )
  // 移动端只移动空闲入口；录音、识别及错误状态保留在 Composer，不随菜单关闭卸载。
  if (idleTarget === null && !err) return null
  return <>{idleTarget ? createPortal(button, idleTarget) : button}
    {err && <span role="alert" className="max-w-full break-words text-xs text-[var(--color-destructive)]">{err}</span>}
  </>
}
