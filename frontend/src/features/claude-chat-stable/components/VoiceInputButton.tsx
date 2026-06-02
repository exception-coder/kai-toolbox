import { useEffect, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { sttAvailable, transcribe } from '../api'

/**
 * 麦克风按钮：点一下开始录音，再点停止并转写，转写文本经 onText 回填输入框。
 * 浏览器不支持录音或 faster-whisper 服务未就绪时禁用并提示。
 */
export function VoiceInputButton({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const rec = useVoiceRecorder()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    sttAvailable().then(setAvailable)
  }, [])

  const handle = async () => {
    setErr(null)
    if (rec.recording) {
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
    } else {
      try {
        await rec.start()
      } catch {
        setErr('无法访问麦克风')
      }
    }
  }

  const off = !rec.supported || available === false
  const title = !rec.supported ? '当前浏览器不支持录音'
    : available === false ? 'faster-whisper 服务未启动，语音输入不可用'
    : err ? err
    : rec.recording ? '点击停止并转写'
    : '语音输入'

  return (
    <Button
      type="button"
      variant={rec.recording ? 'default' : 'ghost'}
      size="icon"
      onClick={handle}
      disabled={disabled || off || busy}
      title={title}
      aria-label={title}
    >
      {busy ? <Loader2 className="size-5 animate-spin" />
        : rec.recording
          ? <span className="flex items-center gap-1"><Square className="size-4" /><span className="text-xs tabular-nums">{rec.seconds}s</span></span>
          : <Mic className="size-5" />}
    </Button>
  )
}
