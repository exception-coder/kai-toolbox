import { useEffect, useState } from 'react'
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
export function VoiceInputButton({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const rec = useVoiceRecorder()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    sttAvailable().then(setAvailable)
  }, [])

  const start = async () => {
    setErr(null)
    try {
      await rec.start()
    } catch {
      setErr('无法访问麦克风')
    }
  }

  const stopAndTranscribe = async () => {
    setErr(null)
    try {
      const blob = await rec.stop()
      setBusy(true)
      const text = await transcribe(blob)
      if (text) onText(text)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '转写失败')
    } finally {
      setBusy(false)
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
  const title = !rec.supported ? '当前浏览器不支持录音'
    : available === false ? 'faster-whisper 服务未启动，语音输入不可用'
    : err ? err
    : '语音输入'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={start}
      disabled={disabled || off}
      title={title}
      aria-label={title}
    >
      <Mic className="size-5" />
    </Button>
  )
}
