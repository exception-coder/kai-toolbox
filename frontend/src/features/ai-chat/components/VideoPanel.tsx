import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Clapperboard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getVideoTask, submitVideo } from '../api'

interface Props {
  /** 当前视频模型（category=video）；为空表示无可用视频模型。 */
  model: string
}

const SECONDS = ['4', '8', '12']
const SIZES = ['1280x720', '720x1280']
const POLL_MS = 5000
const STATUS_LABEL: Record<string, string> = {
  queued: '排队中', initializing: '初始化', in_progress: '生成中', downloading: '下载中', uploading: '上传中',
}

interface Done {
  id: string
  prompt: string
  model: string
  url: string
}

/** 视频模式：提示词 + 时长/分辨率 → 提交异步任务 → 轮询进度 → 播放器。会话级临时，不入聊天历史。 */
export function VideoPanel({ model }: Props) {
  const [prompt, setPrompt] = useState('')
  const [seconds, setSeconds] = useState('4')
  const [size, setSize] = useState(SIZES[0])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null) // 非空表示有任务在跑
  const [history, setHistory] = useState<Done[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const running = status != null
  const canSubmit = !!model && !running && prompt.trim().length > 0

  const poll = (id: string, prompt: string, mdl: string) => {
    timerRef.current = setTimeout(async () => {
      if (!aliveRef.current) return
      try {
        const t = await getVideoTask(id)
        if (!aliveRef.current) return
        if (t.status === 'completed' && t.videoUrl) {
          setHistory((prev) => [{ id, prompt, model: mdl, url: t.videoUrl! }, ...prev])
          setStatus(null)
        } else if (t.status === 'failed') {
          setError(t.error || '视频生成失败')
          setStatus(null)
        } else {
          setStatus(t.status || 'in_progress')
          poll(id, prompt, mdl)
        }
      } catch (e) {
        if (!aliveRef.current) return
        setError(e instanceof Error ? e.message : '轮询失败')
        setStatus(null)
      }
    }, POLL_MS)
  }

  async function submit() {
    if (!canSubmit) return
    setError(null)
    const p = prompt.trim()
    try {
      const t = await submitVideo({ model, prompt: p, seconds, size })
      setStatus(t.status || 'queued')
      setPrompt('')
      poll(t.id, p, t.model || model)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
      setStatus(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {history.length === 0 && !running && (
          <div className="flex h-full flex-col items-center justify-center text-center text-[var(--color-muted-foreground)]">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Clapperboard className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-[var(--color-foreground)]">视频模式</h2>
            <p className="mt-1 text-sm">{model ? '输入提示词，选时长与分辨率，点生成（异步，约数分钟）' : '当前无可用视频模型（顶部选 category=video 的模型，如 sora-2）'}</p>
          </div>
        )}
        {running && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="size-4 animate-spin" />
            {STATUS_LABEL[status!] ?? status}…（视频生成较慢，请稍候，期间可不要离开本页）
          </div>
        )}
        {history.map((v) => (
          <div key={v.id} className="space-y-2">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              <span className="font-medium text-[var(--color-foreground)]">{v.prompt}</span>
              <span className="ml-2">· {v.model}</span>
            </p>
            <video src={v.url} controls className="max-h-[60vh] w-full rounded-lg border bg-black" />
            <a href={v.url} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-primary)] underline">
              在新标签打开 / 下载
            </a>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
        </div>
      )}

      <div className="border-t bg-[var(--color-background)] p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <label className="flex items-center gap-1">
            时长
            <select value={seconds} onChange={(e) => setSeconds(e.target.value)} disabled={running} className="rounded-md border bg-[var(--color-background)] px-1.5 py-1 text-xs">
              {SECONDS.map((s) => (
                <option key={s} value={s}>{s}s</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            分辨率
            <select value={size} onChange={(e) => setSize(e.target.value)} disabled={running} className="rounded-md border bg-[var(--color-background)] px-1.5 py-1 text-xs">
              {SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-40 min-h-[40px] flex-1 resize-none rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
            rows={1}
            placeholder={model ? '描述视频画面，Enter 生成，Shift+Enter 换行' : '无可用视频模型'}
            value={prompt}
            disabled={!model || running}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          <Button size="icon" disabled={!canSubmit} onClick={submit} title="生成">
            {running ? <Loader2 className="animate-spin" /> : <Clapperboard />}
          </Button>
        </div>
      </div>
    </div>
  )
}
