import { useEffect, useState } from 'react'
import { ArrowUp, Loader2, Mic, X } from 'lucide-react'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { sttAvailable, transcribe } from '../api'

/**
 * 迷你态语音条（仿系统语音输入条）：
 * - 空闲：一条「点击说话」胶囊，点一下开始录音
 * - 录音中：左 ✕ 取消 | 中间灰条（跳动绿点 + 秒数）| 右绿色 ↑ 停止并转写后直接发送
 * - 转写中：胶囊显示「识别中…」
 * 转写文本经 onSend 直接发送（迷你态无输入框）。
 */
export function MiniVoiceBar({ onSend, disabled }: { onSend: (t: string) => void; disabled?: boolean }) {
  const rec = useVoiceRecorder()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { sttAvailable().then(setAvailable) }, [])

  const off = !rec.supported || available === false || !!disabled

  const start = async () => {
    setErr(null)
    try { await rec.start() } catch { setErr('无法访问麦克风') }
  }
  const send = async () => {
    setErr(null)
    try {
      const blob = await rec.stop()
      setBusy(true)
      const t = await transcribe(blob)
      const x = t?.trim()
      if (x) onSend(x)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '转写失败')
    } finally {
      setBusy(false)
    }
  }
  const cancel = async () => {
    try { await rec.stop() } catch { /* 丢弃录音 */ }
  }

  if (busy) {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-background)] px-4 py-2 text-sm text-[var(--color-muted-foreground)]">
        <Loader2 className="size-4 animate-spin" /> 识别中…
      </div>
    )
  }

  if (rec.recording) {
    return (
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={cancel}
          aria-label="取消"
          title="取消录音"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-background)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <X className="size-4" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--color-background)] px-4 py-2">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <span key={i} className="size-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i * 110}ms` }} />
          ))}
          <span className="ml-2 text-xs tabular-nums text-[var(--color-muted-foreground)]">{rec.seconds}s</span>
        </div>
        <button
          type="button"
          onClick={send}
          aria-label="发送"
          title="停止并发送"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={off}
      title={!rec.supported ? '当前浏览器不支持录音' : available === false ? 'faster-whisper 服务未启动' : err ?? '点击说话'}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-background)] px-4 py-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Mic className="size-4" />
      {off ? '语音不可用' : err ?? '点击说话，停止后自动发送'}
    </button>
  )
}
