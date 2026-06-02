import { useEffect, useRef, useState } from 'react'
import { Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCondenseJob } from '../hooks/useCondenseJob'
import { SpeedTimeline } from '../components/SpeedTimeline'
import { artifactUrl } from '../api'
import type { SegmentView } from '../types'

const STATUS_LABEL: Record<string, string> = {
  PENDING: '排队中',
  ANALYZING: '分析中',
  ANALYZED: '分析完成，可微调',
  RENDERING: '渲染中',
  DONE: '完成',
  FAILED: '失败',
  CANCELLED: '已取消',
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s - m * 60)
  return `${m}分${sec.toString().padStart(2, '0')}秒`
}

export function VideoCondensePage() {
  const { job, error, busy, analyzeVideo, renderVideo, cancel, reset } = useCondenseJob()
  const [path, setPath] = useState('')
  const [music, setMusic] = useState('')
  const [edit, setEdit] = useState<SegmentView[]>([])
  const syncedRef = useRef<string>('')

  // ANALYZED 首次到达时把曲线灌进可编辑状态
  useEffect(() => {
    if (job?.status === 'ANALYZED' && syncedRef.current !== job.jobId) {
      setEdit(job.segments)
      syncedRef.current = job.jobId
    }
  }, [job])

  const running = job?.status === 'ANALYZING' || job?.status === 'RENDERING'
  const estOut = edit.reduce((a, s) => a + (s.end - s.start) / Math.max(0.01, s.speed), 0)

  const startNew = () => {
    reset()
    setEdit([])
    syncedRef.current = ''
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Gauge className="size-5" /> 视频智能变速
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          分析录屏画面活动度，无聊段加速、关键段保速，输出浓缩视频。
        </p>
      </header>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
          placeholder="本地视频绝对路径，如 D:/records/coding.mp4"
          value={path}
          onChange={e => setPath(e.target.value)}
          disabled={busy || running}
        />
        <Button onClick={() => analyzeVideo(path)} disabled={!path.trim() || busy || running}>
          分析
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {job && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">{STATUS_LABEL[job.status] ?? job.status}</span>
            {job.durationSec != null && (
              <span className="text-[var(--color-muted-foreground)]">原片 {fmtDuration(job.durationSec)}</span>
            )}
            {(job.status === 'DONE' || job.status === 'FAILED' || job.status === 'CANCELLED') && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={startNew}>重新开始</Button>
            )}
          </div>

          {running && (
            <div className="mb-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                <div
                  className="h-full bg-[var(--color-primary)] transition-all"
                  style={{ width: `${Math.round((job.progress || 0) * 100)}%` }}
                />
              </div>
              {job.status === 'RENDERING' && (
                <Button variant="outline" size="sm" className="mt-2" onClick={cancel}>取消</Button>
              )}
              {job.status === 'ANALYZING' && (
                <Button variant="outline" size="sm" className="mt-2" onClick={cancel}>取消</Button>
              )}
            </div>
          )}

          {job.error && <p className="text-sm text-red-600">{job.error}</p>}

          {job.status === 'ANALYZED' && (
            <div className="space-y-3">
              <SpeedTimeline segments={edit} duration={job.durationSec ?? 0} onChange={setEdit} />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="flex-1 rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
                  placeholder="背景音乐路径（可选，留空则无声）"
                  value={music}
                  onChange={e => setMusic(e.target.value)}
                />
                <span className="text-sm text-[var(--color-muted-foreground)]">
                  预计输出 ≈ {fmtDuration(estOut)}
                </span>
                <Button onClick={() => renderVideo(edit, music)} disabled={!edit.length || busy}>
                  生成
                </Button>
              </div>
            </div>
          )}

          {job.status === 'DONE' && (
            <div className="space-y-2">
              <video src={artifactUrl(job.jobId)} controls className="w-full rounded-lg border" />
              <a
                href={artifactUrl(job.jobId)}
                download
                className="inline-block text-sm text-[var(--color-primary)] underline"
              >
                下载浓缩视频
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
